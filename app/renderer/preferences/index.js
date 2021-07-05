const {ipcRenderer, remote} = require('electron');
const settings = require('electron-settings');

const domainEl = document.getElementById('domain');
const favEl = document.getElementById('favorites');
const customEl = document.getElementById('custom');
const convListEl = document.querySelector('.conv-list');
const conv1 = document.getElementById('conv1');
const conv2 = document.getElementById('conv2');
const conv3 = document.getElementById('conv3');
const conv4 = document.getElementById('conv4');
const conv5 = document.getElementById('conv5');

function toggle() {
  convListEl.style.display = customEl.checked ? '' : 'none';
}

function init() {
  const domain = settings.get('domain');
  domainEl.value = domain;

  const tray = settings.get('tray', {
    favorites: true,
    custom: []
  });
  convListEl.style.display = !tray.favorites ? '' : 'none';
  favEl.checked = !!tray.favorites;
  customEl.checked = !tray.favorites;
  conv1.value = tray.custom.length > 0 ? tray.custom[0] : '';
  conv2.value = tray.custom.length > 1 ? tray.custom[1] : '';
  conv3.value = tray.custom.length > 2 ? tray.custom[2] : '';
  conv4.value = tray.custom.length > 3 ? tray.custom[3] : '';
  conv5.value = tray.custom.length > 4 ? tray.custom[4] : '';
}

function save() {
  const oldDomain = settings.get('domain');
  settings.set('domain', domainEl.value);

  const custom = [];
  conv1.value && custom.push(conv1.value);
  conv2.value && custom.push(conv2.value);
  conv3.value && custom.push(conv3.value);
  conv4.value && custom.push(conv4.value);
  conv5.value && custom.push(conv5.value);
  const favorites = !!favEl.checked || !custom.length;
  settings.set('tray', {
    favorites: favorites,
    custom: custom
  });

  if (oldDomain !== domainEl.value) {
    // re-login
    ipcRenderer.send('re-login');
  } else {
    // reset the trays
    ipcRenderer.send('re-initialize');
  }

  remote.getCurrentWindow().close();
}

init();