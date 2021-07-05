/*
 * Module to perform OAuth 2.0 Authorization Code authentication
 * with Circuit. Return the access token that can be used to
 * logon to Circuit.
 */

'use strict';

const settings = require('electron-settings');
const electronOauth2 = require('electron-oauth2');
const fetch = require('node-fetch');

module.exports = function (config) {

  const windowParams = {
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false
    },
    width: 450,
    height: 550
  }
  const oauthConfig = {
      clientId: config.client_id,
      clientSecret: config.client_secret,
      authorizationUrl: `https://${config.domain}/oauth/authorize`,
      tokenUrl: `https://${config.domain}/oauth/token`,
      redirectUri: config.redirectUri
  };
  const myApiOauth = electronOauth2(oauthConfig, windowParams);

  function getAccessToken() {
    return new Promise((resolve, reject) => {
      myApiOauth.getAccessToken({scope: config.scope || 'ALL'})
        .then(token => {
          if (token && token.access_token) {
            settings.set('token', token);
            resolve(token.access_token);
            return;
          }
          reject(token.error);
        })
        .catch(reject)
    });
  }

  function getToken() {
    let token = settings.get('token');
    if (token && token.access_token) {
      return fetch(oauthConfig.tokenUrl + '/' + token.access_token)
        .then(() => token.access_token)
        .catch(err => {
          console.log(`Token was invalid. Request new token.`, err);
          return getAccessToken();
        });
    }
    return getAccessToken();
  }

  function clearToken() {
    settings.delete('token');
  }

  function refreshToken() {
    let token = settings.get('token');
    token = myApiOauth.refreshToken(token.refreshToken);
    settings.set('token', token);
    return token;
  }

  return {
    getToken: getToken,
    clearToken: clearToken,
    refreshToken: refreshToken
  };
};
