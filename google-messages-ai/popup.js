'use strict';

// Load saved default behavior
chrome.storage.sync.get(['behavior'], result => {
  if (result.behavior) {
    const sel = document.getElementById('default-behavior');
    if (sel) sel.value = result.behavior;
  }
});

// Save on change
document.getElementById('default-behavior').addEventListener('change', e => {
  chrome.storage.sync.set({ behavior: e.target.value });
});

// Open Messages tab
document.getElementById('open-btn').addEventListener('click', () => {
  chrome.tabs.query({ url: 'https://messages.google.com/*' }, tabs => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: 'https://messages.google.com/web' });
    }
    window.close();
  });
});

// Check Chrome AI availability in the active tab
async function checkAI() {
  const statusBox = document.getElementById('ai-status-box');
  const statusText = document.getElementById('ai-status-text');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Only works if we're on messages.google.com
    if (!tab?.url?.startsWith('https://messages.google.com')) {
      statusBox.className = 'ai-status warn';
      statusText.textContent = 'Navigate to messages.google.com first';
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (!window.ai) return 'no-api';
        const api = window.ai.languageModel ?? window.ai;
        if (typeof api.availability !== 'function') {
          // Older API — assume ready if createTextSession exists
          return window.ai.createTextSession ? 'readily' : 'no-api';
        }
        return await api.availability();
      }
    });

    if (result === 'readily') {
      statusBox.className = 'ai-status ok';
      statusText.textContent = '✅ Chrome AI is ready — on-device Gemini Nano available';
    } else if (result === 'after-download') {
      statusBox.className = 'ai-status warn';
      statusText.textContent = '⏳ AI model downloading — try generating in a moment';
    } else if (result === 'no-api') {
      statusBox.className = 'ai-status error';
      statusText.textContent = '❌ window.ai not found — follow setup steps below';
    } else {
      statusBox.className = 'ai-status error';
      statusText.textContent = `❌ AI unavailable (${result}) — follow setup steps below`;
    }
  } catch (err) {
    statusBox.className = 'ai-status warn';
    statusText.textContent = `Could not check: ${err.message}`;
  }
}

checkAI();
