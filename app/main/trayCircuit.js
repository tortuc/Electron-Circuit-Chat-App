'use strict';

const {BrowserWindow, ipcMain, Menu, nativeImage, Tray} = require('electron');
const opn = require('opn');
const path = require('path');
const sharp = require('sharp');
const settings = require('electron-settings');
const Circuit = require('circuit-sdk');

let _tray;
let _emitter;
let _sdkProxy;
let _signinTemplate, _signoutTemplate;
let _iconBuffer, _iconBufferGrey;

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const iconSize = isMac ? 18 : 19;
const iconPadding = isMac ? {top: 1, bottom: 1, left: 2, right: 2} : {top: 0, bottom: 0, left: 0, right: 0};
const chrome = isMac ? 'google chrome' : isWin ? 'chrome' : 'google-chrome';

async function create(emitter, sdkProxy) {
  _emitter = emitter;
  _sdkProxy = sdkProxy;

  // Create Circuit tray
  let icon = await sharp(`${__dirname}/../assets/32x32.png`)
    .resize(iconSize, iconSize)
    //.background({r: 0, g: 0, b: 0, alpha: 0})
    .extend(iconPadding)
    .png();

  _iconBuffer = await icon.toBuffer();
  _iconBufferGrey = await icon.greyscale().toBuffer();

  _tray = new Tray(nativeImage.createFromBuffer(_iconBufferGrey));
  _tray.setToolTip('Circuit Chat');
  //_tray.setHighlightMode(false);

  const domain = settings.get('domain');
  _signinTemplate = [
    {
      label: 'Open Circuit',
      click () { opn(`https://${domain}`, {app: chrome}); }
    },
    {
      label: 'Preferences...',
      click () { showPreferences(); }
    },
    {
      label: 'About',
      click () { showAbout(); }
    },
    {type: 'separator'},
    {
      id: 'signin',
      label: 'Sign in',
      click () { _emitter.emit('logon'); }
    },
    {type: 'separator'},
    {role: 'quit'}
  ];

  _signoutTemplate = _signinTemplate.map(t => {
    if (t.id === 'signin') {
      return {
        label: 'Sign out',
        click () { _emitter.emit('logout'); }
      }
    }
    return t;
  });

  sdkProxy.on('connectionStateChanged', evt => {
    let isConnected = evt.state === Circuit.Enums.ConnectionState.Connected;
    updateMenu(isConnected);
    updateIcon(isConnected);
    setTitle(evt.state === Circuit.Enums.ConnectionState.Reconnecting ? evt.state : '');
  });

  updateMenu();

  console.log('Created Circuit tray');

  return {
    destroy: () => {
      _tray.destroy();
      _tray = null;
    }
  };
}

function setTitle(title) {
  _tray && _tray.setTitle(title);
}

function updateMenu(isConnected) {
  if (_tray) {
    let menu = isConnected ? _signoutTemplate: _signinTemplate;
    let contextMenu = Menu.buildFromTemplate(menu);
    _tray.setContextMenu(contextMenu);
  }
}

function updateIcon(isConnected) {
  if (_tray) {
    _tray.setImage(isConnected ?
        nativeImage.createFromBuffer(_iconBuffer) :
        nativeImage.createFromBuffer(_iconBufferGrey));
  }
}

function showPreferences() {
  let window = new BrowserWindow({
    width: 400,
    height: 430,
    show: false,
    resizable: false,
  });

  window.loadURL(`file://${path.join(__dirname, '../renderer/preferences/index.html')}`);

  window.show();
  window.focus();
}

function showAbout() {
  let window = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    resizable: false,
  });

  window.loadURL(`file://${path.join(__dirname, '../renderer/about/index.html')}`);

  window.show();
  window.focus();
}

module.exports = {
    create,
    setTitle,
    updateMenu
};