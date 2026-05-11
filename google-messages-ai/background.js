'use strict';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    behavior: 'kind',
    customSystemPrompt: '',
    debugMode: true
  });
});
