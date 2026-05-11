'use strict';
// Runs in ISOLATED world — has chrome.* APIs.
// Bridges chrome.storage and chrome.runtime ↔ MAIN world via CustomEvents.

const KEYS = ['behavior', 'customSystemPrompt', 'ollamaModel'];

// ── Settings sync ────────────────────────────────────────────────────────────

function pushSettings(items) {
  window.dispatchEvent(new CustomEvent('mai-storage-push', {
    detail: {
      behavior:           items.behavior           ?? 'kind',
      customSystemPrompt: items.customSystemPrompt ?? '',
      ollamaModel:        items.ollamaModel        ?? 'llama3.2'
    }
  }));
}

chrome.storage.sync.get(KEYS, pushSettings);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const update = {};
  KEYS.forEach(k => { if (changes[k]) update[k] = changes[k].newValue; });
  if (Object.keys(update).length) pushSettings(update);
});

window.addEventListener('mai-save-setting', e => {
  const { key, value } = e.detail ?? {};
  if (key && KEYS.includes(key)) chrome.storage.sync.set({ [key]: value });
});

// ── Ollama status check ──────────────────────────────────────────────────────

window.addEventListener('mai-ollama-check', () => {
  chrome.runtime.sendMessage({ type: 'ollama-check' }, response => {
    window.dispatchEvent(new CustomEvent('mai-ollama-result', {
      detail: response ?? { ok: false, error: 'No response from background' }
    }));
  });
});

// ── Streaming generation ─────────────────────────────────────────────────────

let activePort = null;

window.addEventListener('mai-generate-cancel', () => {
  if (activePort) { try { activePort.disconnect(); } catch (_) {} activePort = null; }
});

window.addEventListener('mai-generate-request', e => {
  const { systemPrompt, prompt, model } = e.detail ?? {};

  if (activePort) { try { activePort.disconnect(); } catch (_) {} }

  const port = chrome.runtime.connect({ name: 'mai-generate' });
  activePort = port;

  port.onMessage.addListener(msg => {
    if (msg.type === 'chunk') {
      window.dispatchEvent(new CustomEvent('mai-generate-chunk', { detail: { text: msg.text } }));
    } else if (msg.type === 'done') {
      window.dispatchEvent(new CustomEvent('mai-generate-done',  { detail: { text: msg.text } }));
      activePort = null;
      port.disconnect();
    } else if (msg.type === 'error') {
      window.dispatchEvent(new CustomEvent('mai-generate-error', { detail: { message: msg.message } }));
      activePort = null;
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    activePort = null;
    const err = chrome.runtime.lastError;
    if (err) {
      window.dispatchEvent(new CustomEvent('mai-generate-error', {
        detail: { message: err.message }
      }));
    }
  });

  port.postMessage({ systemPrompt, prompt, model });
});
