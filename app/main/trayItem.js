'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opn = require('opn');
const settings = require('electron-settings');
const request = require('request').defaults({encoding: null});
const {app, BrowserWindow, ipcMain, Tray, nativeImage} = require('electron');
const Circuit = require('circuit-sdk');

/**
 * Class for a direct user tray item
 */
class TrayItem {
  constructor(conversation, sdkProxy, emitter) {
    this._conversation = conversation;
    this._sdkProxy = sdkProxy;
    this._emitter = emitter;
    this._avatarBuffer = null;
    this._tray = null;
    this._presenceState = Circuit.Enums.PresenceState.OFFLINE;
    this._hasUnread = 0;
    this._window = null;
    this._domain = settings.get('domain');
    this._callActive = false;
  }

  get conversation() { return this._conversation; }

	get presenceState() { return this._presenceState; }
	set presenceState(value) {
    if (this._presenceState !== value) {
      this._presenceState = value;
      this.renderIcon();
    }
  }

	get hasUnread() { return this._hasUnread; }
	set hasUnread(value) {
    if (this._hasUnread !== value) {
      this._hasUnread = !!value;
      this.renderIcon();
    }
  }

  // Initialize the trayItem. async due to avatar manipulation
  async init() {
    try {
      const roundedCorners = new Buffer('<svg><rect x="0" y="0" width="18" height="18" rx="9" ry="9"/></svg>');
      const isMac = process.platform === 'darwin';
      const iconSize = isMac ? 18 : 19;
      const iconPadding = isMac ? {top: 1, bottom: 1, left: 2, right: 2} : {top: 0, bottom: 0, left: 0, right: 0};
      
      // Download the user's avatar, resize it, make round corners, position it,
      // convert to png for transparency, convert it to a nativeImage and show it.
      let file = `${app.getPath('temp')}circuit-chat-${this._conversation.peerUser.userId}`;

      // Download the user's avatar
      await this.download(this._conversation.peerUser.avatar, file);

      // Resize avatar, make round corners, position it and convert to png for
      // transparency and save as buffer
      this._avatarBuffer = await sharp(file)
        .resize(iconSize, iconSize)
       // .overlayWith(roundedCorners, {cutout: true})
        .extend(iconPadding)
        .png()
        .toBuffer();

      // Buffer for call icon
      this._callBuffer = await sharp(`${__dirname}/../assets/call.png`)
        .resize(iconSize, iconSize)
       // .overlayWith(roundedCorners, {cutout: true})
        .extend(iconPadding)
        .png()
        .toBuffer();

      this.setupSdkListeners();

      // Set initial presence state
      let presence = await this._sdkProxy.getPresence(this._conversation.peerUser.userId);
      this._presenceState = presence[0].state;

      // Set initial unread indicator
      this._hasUnread = this._conversation.userData.unreadItems > 0;

      // Subscribe to presence changes
      this._sdkProxy.subscribePresence(this._conversation.peerUser.userId);

      // Get last 20 items. Disregard threading in this app.
      this._conversation.items = await this._sdkProxy.getConversationItems(this._conversation.convId, {
        numberOfItems: 20
      });
      return this;
    } catch (err) {
      console.log(err);
    }
  }

  // Create the tray
  createTray() {
    // Create a native image from the buffer and create the tray
    let avatar = nativeImage.createFromBuffer(this._avatarBuffer);
    this._tray = new Tray(avatar);
    this._tray.setToolTip(this._conversation.peerUser.displayName);
   // this._tray.setHighlightMode(false);
    this.renderIcon();
    console.log(`Created tray for ${this._conversation.peerUser.displayName} (${this._presenceState})`);

    this.setupTrayListeners();
    this.setupRendererListeners();
    this.createWindow();
  }

  // Destroy the tray
  destroy() {
    this._tray.destroy();
    ipcMain.removeAllListeners('navigate');
    ipcMain.removeAllListeners('addTextItem');
    ipcMain.removeAllListeners('makeCall');
    ipcMain.removeAllListeners('endCall');
  }

  // Download the avatar
  download(uri, filename) {
    return new Promise((resolve, reject) => {
      request.head(uri, (err, res, body) => {
        let auth = {
          'auth': {
            'bearer': this._sdkProxy.accessToken
          }
        };
        request(uri, auth)
          .pipe(fs.createWriteStream(filename))
          .on('finish', resolve);
      });
    });
  }

  // Render the avatar in the tray
  async renderIcon() {
    if (!this._tray) {
      return;
    }
    let buffer;

    if (this._callActive) {
      // Show call icon
      let icon = nativeImage.createFromBuffer(this._callBuffer);
      this._tray.setImage(icon);
      return;
    }

    // Presence ring
    switch (this._presenceState) {
      case Circuit.Enums.PresenceState.AVAILABLE:
      case Circuit.Enums.PresenceState.BUSY:
        let available = new Buffer('<svg width="18" height="18"><circle cx="14" cy="14" r="4" fill="#87c341"/></svg>');
        available = new Buffer('<svg><circle cx="9" cy="9" r="8" stroke="#87c341" stroke-width="2" fill="none"/></svg>');
        buffer = await sharp(this._avatarBuffer)
          .overlayWith(available)
          .png()
          .toBuffer();
        break;

      case Circuit.Enums.PresenceState.DND:
        let redRing = new Buffer('<svg><circle cx="9" cy="9" r="8" stroke="red" stroke-width="2" fill="none"/></svg>');
        buffer = await sharp(this._avatarBuffer)
          .overlayWith(redRing)
          .png()
          .toBuffer();
        break;

      default:
        buffer = this._avatarBuffer;
        break;
    }

    // Unread indicator
    if (this._hasUnread) {
      let unreadIndicator = new Buffer('<svg width="18" height="18"><circle cx="14" cy="4" r="4" fill="red"/></svg>');
      buffer = await sharp(buffer)
        .overlayWith(unreadIndicator)
        .png()
        .toBuffer();
    }

    let icon = nativeImage.createFromBuffer(buffer);
    this._tray.setImage(icon);
  }

  // Create window for user
  createWindow() {
    // Make the popup window for the menubar
    this._window = new BrowserWindow({
      width: 320,
      height: 375,
      show: false,
      frame: false
    })

    // Tell the popup window to load our index.html file
    this._window.loadURL(`file://${path.join(__dirname, '../renderer/chat/index.html')}`);

    // Only close the window on blur if dev tools isn't opened
    this._window.on('blur', () => {
      if (!this._window.webContents.isDevToolsOpened()) {
        this._window.hide();
      }
    });

    this._window.webContents.on('did-frame-finish-load', () => {
      // Send initial data to UI
      this._window.webContents.send('initial-data', {
        localUserId: this._sdkProxy.user.userId,
        conversation: this._conversation,
        presenceState: this._presenceState
      });
    });
  }

  // Toggle the window
  toggleWindow() {
    if (this._window.isVisible()) {
      this.hideWindow();
    } else {
      this.showWindow();
    }
  }

  // Show the window
  showWindow() {
    const trayPos = this._tray.getBounds();
    const windowPos = this._window.getBounds();
    let x, y = 0;
    if (process.platform == 'darwin') {
      x = Math.round(trayPos.x + trayPos.width / 2 - windowPos.width / 2);
      y = Math.round(trayPos.y + trayPos.height);
    } else {
      x = Math.round(trayPos.x + trayPos.width / 2 - windowPos.width / 2);
      y = Math.round(trayPos.y - windowPos.height - 1);
    }

    this._window.setPosition(x, y, false);
    this._window.show();
    this._window.focus();
  }

  hideWindow() {
    this._window.hide();
  }

  // Tray listeners
  setupTrayListeners() {
    this._tray.on('click', evt => this.toggleWindow());
    this._tray.on('double-click', evt => this.toggleWindow());
  }

  // Renderer listeners (from UI window)
  setupRendererListeners() {
    ipcMain.on('navigate', (e, userId, dest) => {
      if (this._sdkProxy.user.userId === userId) {
        if (dest && dest.convId) {
          const isMac = process.platform === 'darwin';
          const isWin = process.platform === 'win32';
          const chrome = isMac ? 'google chrome' : isWin ? 'chrome' : 'google-chrome';
          opn(`https://${this._domain}/#/conversation/${dest.convId}`, {app: chrome});
        }
      }
    });

    ipcMain.on('addTextItem', (e, convId, content) => {
      if (this._conversation.convId === convId) {
        this._sdkProxy.addTextItem(convId, content)
          .catch(console.error);
      }
    });

    ipcMain.on('makeCall', (e, convId, userId) => {
      if (this._conversation.convId === convId) {
        this._sdkProxy.makeCall(userId)
          .catch(console.error);
      }
    });

    ipcMain.on('endCall', (e, convId, callId) => {
      if (this._conversation.convId === convId) {
        this._sdkProxy.endCall(callId)
          .catch(console.error);
      }
    });
  }

  // SDK listeners
  setupSdkListeners() {
    this._sdkProxy.on('userPresenceChanged', evt => {
      if (evt.presenceState.userId === this._conversation.peerUser.userId) {
        // User's presence has changed. Update the tray.
        this.presenceState = evt.presenceState.state;
        this._window.webContents.send('userPresenceChanged', evt);
      }
    });

    this._sdkProxy.on('itemAdded', evt => {
      if (evt.item.convId === this._conversation.convId) {
        if (evt.item.creatorId !== this._sdkProxy.user.userId) {
          // New item has been added, assume user doens't have the pop-down open,
          // so show the unread indicator
          this.hasUnread = true;
        }
        this._window.webContents.send('itemAdded', evt);
      }
    });

    this._sdkProxy.on('conversationReadItems', evt => {
      if (evt.data.convId === this._conversation.convId) {
        // User read item(s) on another device. For simplicity just re-read
        // the conversation to get the unread count.
        this._sdkProxy.getConversationById(this._conversation.convId)
          .then(c => this.hasUnread = c.userData.unreadItems > 0)
          .catch(console.error);
      }
    });

    this._sdkProxy.on('callStatus', evt => {
      if (evt.call.convId === this._conversation.convId) {
        this._window.webContents.send('callStatus', evt);
        if (!this._callActive) {
          this._callActive = true;
          this.renderIcon();
        }
      }
    });

    this._sdkProxy.on('callEnded', evt => {
      if (evt.call.convId === this._conversation.convId) {
        this._window.webContents.send('callEnded', evt);
        if (this._callActive) {
          this._callActive = false;
          this.renderIcon();
        }
      }
    });
  }

}

module.exports = TrayItem;
