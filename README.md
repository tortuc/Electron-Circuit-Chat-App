# Electron Circuit Chat app

Chat with your favorite users quickly via this native (Windows & Mac) tray application built with electron and the Circuit JS SDK. Trays for up to five users are created which allow chat and calls via Circuit.

## Features

* Configure up to 5 direct conversations to show as tray. If none configured the first 5 favorites are used.
* Chat and direct calls
* Show presence status in tray avatar and detailed presence in chat window.
* Show unread indicator on tray avatar
* Quick link to Circuit conversation. Click on name or avatar in chat window.
* Cross platform: Mac and Windows (Linux should work too, but not tested)

## Goals
* Usage of [Circuit JS SDK](https://github.com/circuit/circuit-sdk) in a desktop app based on [electron](https://electron.atom.io/)
* Specifically how to use the SDK in a renderer process so that the Circuit WebRTC APIs can be used
* Demonstrate simple cross-platform implementation using electron


## Screenshots
<div style="display:inline">
<img height="400px" src="./mac.png"/>
</div>

> On Windows the tray is probably not the best solution for this. Taskbar might be better.

## Architecture

The Circuit WebRTC APIs are not available in the Cirucit Node.JS SDK due to the fact that Node.js does not contain a WebRTC stack. Electron is made up of Node.js and Chromium and therefore within a Chromium renderer process the Circuit WebRTC APIs can be used.

This chat app opens individual chat windows for each user which means either every chat window needs it own JS SDK & login etc, or a common renderer process is used as single SDK access. The later is chosen as this only requires a single websocket connection to the Circuit servers (/renderer/circuit/index.js).

The suggested OAuth authentication method for desktop application is Authorization Code, and since the browser JS SDK does not support the authentication part is done in the main process (/main/oauth.js). Once authenticated and the access token is available, the token is handed over to a proxy class that acts as intermediate between main process APIs calls and the Circuit SDK renderer.

For the two-way binding and rendering of the chat window [hyperHTML](https://github.com/WebReflection/hyperHTML) is used.

[electron-builder](https://github.com/electron-userland/electron-builder) is used to build and package the app as Mac and Windows installers.

### Components

#### Main process components
* index.js: Entry point of app. Manages lifecycle events.
* oauth.js: Handles OAuth 2.0 Authorization Code flow and returns access token
* sdkProxy.js: Proxy Circuit SDK API calls and events for main process modules and to renderer windows
* trayManager.js: Manages the main Circuit tray item and maintains a list individual user trays (trayItems)
* trayCircuit.js: The main Circuit tray with its context menu
* trayItem.js: Manages the chat window for this tray

#### Renderer process components/windows
* /circuit: Circuit SDK adapter
* /preferences: Preferences window
* /about: About window


## Build and run

```bash
    git clone https://github.com/tortuc/Electron-Circuit-Chat-App
    cd Electron-Circuit-Chat-App
    cp config.json.template config.json
    // Add your client_id and client_secret to config.json
    npm install
    npm start
```


### Package app
```bash
    npm dist
```


## Packaged installer downloads
* [Mac](https://goo.gl/t2Aw9y)
* [Windows](https://goo.gl/5S94pT) (only Windows 10 tested)

