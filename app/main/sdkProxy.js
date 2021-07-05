const {BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const EventEmitter = require('events');
const Circuit = require('circuit-sdk');
const oauth = require('./oauth');

const TIMEOUT = 30000;

const GENERIC_METHODS = [
  'getLoggedOnUser',
  'getConversationsByIds',
  'getConversationItems',
  'getUsersById',
  'getUserById',
  'getFavoriteConversationIds',
  'getPresence', 'subscribePresence',
  'getConversationById',
  'addTextItem',
  'makeCall',
  'endCall'
];

// TODO: Use Circuit.supportedEvents instead
let GENERIC_EVENTS = [
  'connectionStateChanged',
  'callStatus',
  'callEnded',
  'itemAdded',
  'itemUpdated',
  'userPresenceChanged',
  'conversationReadItems'
];
//GENERIC_EVENTS = Circuit.supportedEvents;

/**
 * Proxy class for the Circuit SDK. This class is to be used in
 * the electron main thread. It proxies request to a Circuit SDK
 * renderer process to perform the API calls in Chromium which
 * allows using the WebRTC stack and therefore the Circuit WebRTC
 * APIs.
 */
class SdkProxy extends EventEmitter {
  constructor(config) {
    super();
    this._oauthConfig = config;
    this._oauth = oauth(config);
    this._user;
    this._accessToken;
    this._win;
    this._connectionState;

    this.isDevMode = global.isDevMode;

    // Proxy Circuit SDK events from SDK renderer to main processes
    GENERIC_EVENTS.forEach(e => {
      ipcMain.on(e, (sender, evt) => {
        if (e === 'connectionStateChanged') {
          this._connectionState = evt.state;
        }
        this.emit(e, evt);
      });
    });

    // Proxy Circuit SDK API calls to SDK renderer
    GENERIC_METHODS.forEach(method => this[method] = (...args) => this.getRequest(method, args));
  }

  /*
   * Private API
   */

  // Logged on user
  get user() { return this._user; }

  // OAuth 2.0 access token
  get accessToken() { return this._accessToken; }

  logon() {
    if (this._win) {
      this._win.destroy();
      this._win = null;
    }
    return this._oauth.getToken()
      .then(this.createRendererWindow.bind(this))
      .then(user => {
        this.emit('userLoggedOn', user);
        return user;
      })
      .catch(err => {
        if (err && err.message !== 'window was closed by user') {
          this._oauth.clearToken();
          return this.logon();
        }
        return Promise.reject(err);
      })
  }

  logout(...args) {
    this._user = null;
    this._accessToken = null;
    this._oauth.clearToken();
    return this.getRequest('logout', args);
  }

  /*
   * Private methods
   */

  /**
   * Internal generic function to proxy requests to renderer and
   * then proxy the response as well
   */
  getRequest(fn, args) {
    return new Promise((resolve, reject) => {
      const id = this.getId();
      let completed;
      this._win.webContents.send(fn, {id: id, args: args});

      let timer = setTimeout(() => {
        !completed && reject(`Timeout in ${fn} [${id}]`)
        completed = true;
      }, TIMEOUT);

      ipcMain.once(`${fn}-${id}-response`, (sender, err, data) => {
        if (completed) {
          return;
        }
        clearTimeout(timer);
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  /**
   * Create a hidden renderer process to take advantage of Chromiums
   * WebRTC stack, otherwise the Circuit SDK handling could have been
   * done in the main thread using the circuit-sdk Node.js module.
   */
  createRendererWindow(token) {
    return new Promise((resolve, reject) => {
      if (!token) {
        reject('Missing token');
        return;
      }

      this._accessToken = token;

      this._win = new BrowserWindow({
        width: 1200,
        height: 900,
        webPreferences: {
          nodeIntegration: true
        },
        show: isDevMode
      });
      this._win.loadURL(`file://${path.join(__dirname, '../renderer/circuit/index.html')}`);

      // Open dev tools in development mode
      isDevMode && this._win.webContents.openDevTools();

      this._win.webContents.on('did-frame-finish-load', () => {
        this._win.webContents.send('logon-request', this._oauthConfig, token);

        // Error handling in case on response is received from renderer
        let timer = setTimeout(() => reject('Timeout in logon'), TIMEOUT);

        ipcMain.on('logon-response', (sender, err, user) => {
          clearTimeout(timer);
          if (err) {
            reject(err);
            return;
          }
          this._user = user;
          resolve(user);
        });
      });

      this._win.on('closed', () => {
        this._win = null;
        // Reject in case window closes without finishing to load
        reject();
      });
    })
  }

  /**
   * Generate unique request id
   */
  getId(min = 10000000, max = 99999999) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = SdkProxy;
