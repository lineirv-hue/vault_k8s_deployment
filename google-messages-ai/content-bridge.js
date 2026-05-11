'use strict';
// Runs in ISOLATED world — has chrome.* APIs but no window.ai.
// Bridges chrome.storage.sync <-> localStorage so the MAIN world script can read settings.

const KEYS = ['behavior', 'customSystemPrompt'];

function pushToLocalStorage(items) {
  // Communicate to MAIN world via a CustomEvent on the shared DOM
  window.dispatchEvent(new CustomEvent('mai-storage-push', {
    detail: {
      behavior: items.behavior ?? 'kind',
      customSystemPrompt: items.customSystemPrompt ?? ''
    }
  }));
}

// Initial load: push saved settings into the page
chrome.storage.sync.get(KEYS, pushToLocalStorage);

// Keep in sync when the popup changes a setting
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const update = {};
  KEYS.forEach(k => { if (changes[k]) update[k] = changes[k].newValue; });
  if (Object.keys(update).length) pushToLocalStorage(update);
});

// Listen for setting saves coming from the MAIN world
window.addEventListener('mai-save-setting', e => {
  const { key, value } = e.detail ?? {};
  if (key && KEYS.includes(key)) chrome.storage.sync.set({ [key]: value });
});
