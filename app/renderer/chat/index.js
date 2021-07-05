
const {bind:hyper, wire} = require('hyperhtml');
const {ipcRenderer, remote} = require('electron');
const isDevMode = remote.getGlobal('isDevMode');

let callId;
let callState;
let localUserId;
let presenceState;
let conversation;
let items = [];
let newMessage;
let uiCall = false;
let model = {}; // not used here


// HTML elements
const app = document.querySelector('#app');
const headerSection = document.querySelector('#header');
const messagesSection = document.querySelector('#messages');
const inputSection = document.querySelector('#input');

// Generic UI handler (not used here)
const EventListener = {
  handleEvent: e => model[e.target.name] = e.target.value
}


// Render functions

function renderHeader() {
  hyper(headerSection)`
      <div onclick="${navigate}">
        <img class="avatar" src="${conversation && conversation.peerUser.avatar}">
      </div>
      <div class="contact" onclick="${navigate}">
        <h1 class="contact-name">${conversation && conversation.peerUser && conversation.peerUser.displayName}</h1>
        <p class="contact-status">${presenceState}</p>
      </div>
      <div class="contact-actions">
        <button class="${uiCall ? 'button red' : 'button green'}" onclick="${callBtnClick}">${uiCall ? 'Hangup' : 'Call'}</button>
      </div>`;
}

function navigate() {
  ipcRenderer.send('navigate', localUserId, {convId: conversation.convId});
}

function renderMessages() {
  hyper(messagesSection)`${items.map(item =>
      `<div class="msg msg-${item.me ? 'me' : 'them'}">
        <blockquote>${item.msg}</blockquote>
      </div>`)}`;
    scrollToEnd();
}

function renderInput() {
  hyper(inputSection)`
      <textarea rows="2" cols="44" name="content" value="${newMessage}" oninput=${onInput} onkeyup=${onInput} placeholder="Enter Message"></textarea>`;
}

function renderAll() {
  renderHeader();
  renderMessages();
  renderInput();
}


// Internal functions

function scrollToEnd() {
  setTimeout(() => messagesSection.scrollTop = messagesSection.scrollHeight, 50);
}

function onInput(e) {
  if (!e.shiftKey && e.keyCode === 13 && e.target.value) {
    e.preventDefault();
    ipcRenderer.send('addTextItem', conversation.convId, e.target.value.slice(0, -1));
    e.target.value = '';
    return;
  }

  newMessage = e.target.value;
}

function callBtnClick(e) {
  if (callId) {
    ipcRenderer.send('endCall', conversation.convId, callId);
    uiCall = false;
  } else {
    ipcRenderer.send('makeCall', conversation.convId, conversation.peerUser.userId);
    uiCall = true;
  }
  renderHeader();
}

function prepareItem(item) {
  item.msg = item.text.subject ? `${item.text.subject}: ${item.text.content}` : item.text.content;
  item.msg = item.msg.replace(/<hr\s*\/?>/mg,'<br>');
  item.me = item.creatorId === localUserId;
  // Todo: attachment indication, links, etc
  return item;
}


// IPC events from SDK via trayItem

ipcRenderer.on('initial-data', (s, data) => {
  localUserId = data.localUserId;
  conversation = data.conversation;
  items = data.conversation.items
    .filter(item => item.type === 'TEXT')
    .map(prepareItem);
  presenceState = data.presenceState;
  renderAll();
});

ipcRenderer.on('itemAdded', (s, evt) => {
  const item = evt.item;
  if (item.type === 'TEXT') {
    items.push(prepareItem(item));
    renderMessages();
  }
});

ipcRenderer.on('callStatus', (s, evt) => {
  if (callId && callId !== evt.call.callId) {
    console.log('callStatus event for a different call, ignore it');
    return;
  }
  callId = evt.call.callId;
  uiCall = true;
  callState = evt.call.state;
  renderHeader();
});

ipcRenderer.on('callEnded', (s, evt) => {
  callState = '';
  uiCall = false;
  callId = null;
  renderHeader();
});

ipcRenderer.on('userPresenceChanged', (s, evt) => {
  presenceState = evt.presenceState.state;
  callId = null;
  renderHeader();
});


// Initialization
renderAll();
scrollToEnd();
setTimeout(() => document.querySelector('textarea').focus(), 100);
