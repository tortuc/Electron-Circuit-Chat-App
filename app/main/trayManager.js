'use strict';

const {ipcMain} = require('electron');
const settings = require('electron-settings');
const Circuit = require('circuit-sdk'); // Load only for enums and constants
const TrayItem = require('./trayItem');
const TrayCircuit = require('./trayCircuit');

let _emitter, _sdkProxy, _circuitTray;

// List of TrayItem instances
let _trayItems = [];

// Create the main Circuit tray and the individual user tray items
async function init(sdkProxy, emitter) {
  _sdkProxy = sdkProxy;
  _emitter = emitter;

  // Create Circuit tray icon
  _circuitTray && _circuitTray.destroy();
  _circuitTray = await TrayCircuit.create(emitter, sdkProxy);

  // Emitted when logon is finished and user object is available
  sdkProxy.on('userLoggedOn', createTrayItems);

  sdkProxy.on('connectionStateChanged', evt => {
      if (evt.state === Circuit.Enums.ConnectionState.Disconnected) {
        removeTrays();
      } else if (evt.state === Circuit.Enums.ConnectionState.Connected) {
        if (_sdkProxy.user && !_trayItems) {
          // This is a subsequent re-connect
          createTrayItems();
        }
      }
  });
}

// Create the tray items
async function createTrayItems() {
  removeTrays();
  let conversations = await getConversations();

  // Initialize the trayItems in parallel
  let promises = conversations.reverse().map(c => {
    let trayItem = new TrayItem(c, _sdkProxy, _emitter);
    _trayItems.push(trayItem);
    return trayItem.init();
  });

  // When done, create each Tray in the same order
  await Promise.all(promises);
  _trayItems.forEach(trayItem => trayItem.createTray());
}

function removeTrays() {
  _trayItems.forEach(trayItem => trayItem.destroy());
  _trayItems = [];
}

// Get the favorties or custom configured conversations
async function getConversations() {
  let conversations = settings.get('tray', {
    favorites: true,
    custom: []
  });

  if (!conversations.favorites && conversations.custom.some(c => !!c)) {
    // Use custom conversations
    conversations = await _sdkProxy.getConversationsByIds(conversations.custom);
  } else {
    // No conversations defined, so take the first five direct favorites
    let conversationsIds = await _sdkProxy.getFavoriteConversationIds();
    conversations = await _sdkProxy.getConversationsByIds(conversationsIds);
  }

  // Only support direct conversations at the moment
  conversations = conversations.filter(c => c.type === Circuit.Enums.ConversationType.DIRECT);
  conversations = conversations.slice(0, 5);

  // Get the peer user object for each conversation and attach it to the conversation
  let userIds = conversations
    .map(c => c.participants[0] === _sdkProxy.user.userId ? c.participants[1] : c.participants[0])

  let users = await _sdkProxy.getUsersById(userIds);
  for (let i = 0; i < conversations.length; i++) {
    conversations[i].peerUser = users[i];
  }
  return conversations;
}

ipcMain.on('re-initialize', async () => createTrayItems());

module.exports = {
    init
};
