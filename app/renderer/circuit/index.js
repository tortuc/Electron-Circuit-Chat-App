const {ipcRenderer, remote} = require('electron');

let client, user, callId;
let remoteAudio = document.getElementById('remoteAudio');

ipcRenderer.on('logon-request', async (sender, oauth, token) => {
  Circuit.logger.setLevel(remote.getGlobal('sdkLogLevel') || Circuit.Enums.LogLevel.Debug);

  // Create Circuit SDK client instance
  client = new Circuit.Client({
    client_id: oauth.client_id,
    domain: oauth.domain
  });

  // temporary until SDK is fixed
  client.getConversationsByIds = convIds => Promise.all(convIds.map(client.getConversationById));
  client.getUsersById = userIds => Promise.all(userIds.map(client.getUserById));
  Array.prototype.contains = function () {
    return false;
  };

  proxySdkEvents();
  await logon(token);
});

async function logon(token) {
  try {
    user = await client.logon({accessToken: token});
    ipcRenderer.send('logon-response', null, user);
  } catch (err) {
    console.log('Error logging in', err);
    ipcRenderer.send('logon-response', err);
  }
}

// Proxy SDK events to main process (SdkProxy)
function proxySdkEvents() {
  ['connectionStateChanged', 'itemAdded', 'itemUpdated', 'userPresenceChanged', 'conversationReadItems', 'callStatus', 'callEnded'].forEach(e => {
    client.addEventListener(e, evt => {
      if (e === 'callStatus') {
        if (!callId || callId === evt.call.callId) {
          callId = evt.call.callId;
          if (evt.reason === 'remoteStreamUpdated') {
            // Attach the stream to the audio element
            remoteAudio.srcObject = evt.call.remoteAudioStream;
          }
        }
      }
      ipcRenderer.send(evt.type, evt)
    });
  });
}

['logout', 'getLoggedOnUser', 'getConversationsByIds', 'getConversationItems', 'getFavoriteConversationIds', 'getUsersById', 'getUserById', 'getPresence', 'subscribePresence', 'getConversationById', 'addTextItem', 'makeCall', 'endCall'].forEach(fn => {
  ipcRenderer.on(fn, (s, msg) => {
    const {id, args} = msg;
    const name = `${fn}-${id}-response`;
    let p = args ? executeFunctionByName(fn, client, args) : executeFunctionByName(fn, client);
    p
      .then(data => ipcRenderer.send(name, null, data))
      .catch(err => ipcRenderer.send(name, err));
  });
});

function executeFunctionByName(functionName, context, args) {
  //var args = [].slice.call(arguments).splice(2);
  var namespaces = functionName.split('.');
  var func = namespaces.pop();
  for(var i = 0; i < namespaces.length; i++) {
    context = context[namespaces[i]];
  }
  return context[func].apply(context, args);
}



