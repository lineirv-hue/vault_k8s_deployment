'use strict';

const OLLAMA_BASE = 'http://localhost:11434';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    behavior: 'kind',
    customSystemPrompt: '',
    ollamaModel: 'llama3.2'
  });
});

// ── Ollama availability check ────────────────────────────────────────────────

async function checkOllama() {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const data = await r.json();
    const models = (data.models ?? []).map(m => m.name);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Streaming generation via port ────────────────────────────────────────────

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'mai-generate') return;

  port.onMessage.addListener(async ({ systemPrompt, prompt, model }) => {
    let reader;
    try {
      const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3.2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: prompt }
          ],
          stream: true
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        port.postMessage({ type: 'error', message: `Ollama ${response.status}: ${errText}` });
        return;
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              accumulated += json.message.content;
              port.postMessage({ type: 'chunk', text: accumulated });
            }
            if (json.done) {
              port.postMessage({ type: 'done', text: accumulated });
            }
          } catch (_) { /* incomplete JSON line — skip */ }
        }
      }

    } catch (err) {
      port.postMessage({ type: 'error', message: err.message });
    } finally {
      try { reader?.cancel(); } catch (_) {}
    }
  });
});

// ── One-shot messages (availability check, model list) ───────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ollama-check') {
    checkOllama().then(sendResponse);
    return true;
  }
});
