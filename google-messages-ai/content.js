'use strict';

// ─── Behavior presets ───────────────────────────────────────────────────────

const BEHAVIORS = {
  kind: {
    label: 'Kind & Empathetic',
    system: `You are a warm, caring assistant helping someone reply to text messages.
Write responses that are genuine, supportive, and human-sounding.
Keep replies concise — this is a text message, not an essay.
Write ONLY the reply text. No quotes, labels, or explanations.`
  },
  professional: {
    label: 'Professional',
    system: `You are a professional communication assistant crafting text message replies.
Be clear, polite, and concise. Formal but not stiff.
Write ONLY the reply text. No quotes, labels, or explanations.`
  },
  casual: {
    label: 'Casual & Friendly',
    system: `You are helping write casual, friendly text messages.
Sound relaxed and natural — like texting a close friend.
Write ONLY the reply text. No quotes, labels, or explanations.`
  },
  humorous: {
    label: 'Humorous & Witty',
    system: `You are helping write funny, light-hearted text message replies.
Be genuinely witty without being offensive. Stay relevant to the conversation.
Write ONLY the reply text. No quotes, labels, or explanations.`
  },
  brief: {
    label: 'Brief & Direct',
    system: `You write extremely short, direct text message replies (1-2 sentences max).
No filler, get straight to the point.
Write ONLY the reply text. No quotes, labels, or explanations.`
  },
  custom: {
    label: 'Custom (see below)',
    system: '' // filled from textarea
  }
};

// ─── State ──────────────────────────────────────────────────────────────────

let aiSession = null;
let debugLogs = [];
let panelOpen = false;

// ─── Debug logging ──────────────────────────────────────────────────────────

function log(level, msg, data) {
  const entry = { ts: new Date().toLocaleTimeString(), level, msg, data };
  debugLogs.push(entry);
  if (debugLogs.length > 200) debugLogs.shift();

  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[MsgAI][${level}] ${msg}`, data ?? '');

  refreshDebugUI();
}

function refreshDebugUI() {
  const el = document.getElementById('mai-debug-content');
  if (!el) return;

  const rows = debugLogs.slice().reverse().slice(0, 50).map(e => {
    const color = e.level === 'error' ? '#ff6b6b' : e.level === 'warn' ? '#ffd93d' : '#6bcb77';
    const dataStr = e.data != null
      ? `<pre class="mai-log-data">${escHtml(JSON.stringify(e.data, null, 2))}</pre>`
      : '';
    return `<div class="mai-log-row">
      <span class="mai-log-ts">${e.ts}</span>
      <span class="mai-log-lvl" style="color:${color}">[${e.level.toUpperCase()}]</span>
      <span class="mai-log-msg">${escHtml(e.msg)}</span>
      ${dataStr}
    </div>`;
  });

  el.innerHTML = rows.join('') || '<div style="color:#858585">No logs yet.</div>';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Chrome AI ──────────────────────────────────────────────────────────────

async function checkAIAvailability() {
  log('info', 'Checking Chrome AI availability…');

  if (!window.ai) {
    log('error', 'window.ai not found', {
      fix: 'Enable chrome://flags/#prompt-api-for-gemini-nano and chrome://flags/#optimization-guide-on-device-model'
    });
    return 'unavailable';
  }

  const api = window.ai.languageModel ?? window.ai;

  if (typeof api.availability === 'function') {
    try {
      const status = await api.availability();
      log('info', `AI availability: ${status}`);
      return status; // 'readily' | 'after-download' | 'no'
    } catch (e) {
      log('warn', 'availability() threw, assuming ready', { err: e.message });
      return 'readily';
    }
  }

  // Older Chrome versions expose createTextSession directly
  if (typeof (window.ai.createTextSession ?? window.ai.createGenericSession) === 'function') {
    log('info', 'Using legacy window.ai API');
    return 'readily';
  }

  log('error', 'No recognized Chrome AI API found');
  return 'unavailable';
}

async function buildSession(systemPrompt) {
  log('info', 'Creating AI session…');

  if (aiSession) {
    try { aiSession.destroy(); } catch (_) {}
    aiSession = null;
  }

  // Modern API: window.ai.languageModel
  if (window.ai?.languageModel?.create) {
    aiSession = await window.ai.languageModel.create({ systemPrompt });
    log('info', 'Session created (languageModel)', {
      maxTokens: aiSession.maxTokens,
      temperature: aiSession.temperature,
      topK: aiSession.topK
    });
    return;
  }

  // Legacy API: window.ai.createTextSession
  const createFn = window.ai?.createTextSession ?? window.ai?.createGenericSession;
  if (createFn) {
    aiSession = await createFn.call(window.ai, { systemPrompt });
    log('info', 'Session created (legacy API)');
    return;
  }

  throw new Error('No Chrome AI session creator found');
}

async function streamPrompt(prompt, onChunk) {
  // Try streaming first
  if (typeof aiSession.promptStreaming === 'function') {
    const stream = await aiSession.promptStreaming(prompt);
    let last = '';
    for await (const chunk of stream) {
      last = chunk; // cumulative chunks
      onChunk(last);
    }
    return last;
  }
  // Fall back to non-streaming
  const result = await aiSession.prompt(prompt);
  onChunk(result);
  return result;
}

// ─── DOM helpers for Google Messages ────────────────────────────────────────

function readMessages() {
  log('info', 'Reading conversation messages…');

  // Ordered from most specific to most general
  const selectors = [
    'mws-message-part-content',
    'mws-text-message-part',
    '[data-e2e-is-from-me]',
    '.message-wrapper',
    '.msg-container'
  ];

  let elements = null;
  let usedSelector = null;

  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      elements = found;
      usedSelector = sel;
      break;
    }
  }

  if (!elements) {
    // Broad fallback: grab all text nodes inside a message list
    log('warn', 'Precise selectors found nothing — trying broad fallback');
    const container = document.querySelector('mws-messages-list, .messages-container, main');
    if (container) {
      const texts = [];
      container.querySelectorAll('p, span').forEach(el => {
        const t = el.textContent?.trim();
        if (t && t.length > 2 && t.length < 2000) texts.push({ text: t, fromMe: false });
      });
      log('info', `Fallback found ${texts.length} text fragments`);
      return texts;
    }

    log('error', 'Could not read messages — DOM structure unrecognized', {
      tip: 'Open the debug panel, enable it, and share the output'
    });
    return [];
  }

  log('info', `Using selector: ${usedSelector}`, { count: elements.length });

  const messages = [];
  elements.forEach(el => {
    const text = el.textContent?.trim();
    if (!text) return;

    // Determine direction
    let fromMe = false;
    const ancestor = el.closest('[data-e2e-is-from-me]');
    if (ancestor) {
      fromMe = ancestor.getAttribute('data-e2e-is-from-me') === 'true';
    } else {
      const classChain = [el, el.parentElement, el.parentElement?.parentElement]
        .filter(Boolean).map(e => e.className ?? '').join(' ');
      fromMe = /outgoing|from-me|self/i.test(classChain);
    }

    messages.push({ text, fromMe });
  });

  log('info', `Parsed ${messages.length} messages`, {
    fromMe: messages.filter(m => m.fromMe).length,
    fromThem: messages.filter(m => !m.fromMe).length
  });

  return messages;
}

function getContactName() {
  const selectors = [
    'mws-conversation-header h2',
    '[data-e2e-conversation-name]',
    '.contact-name',
    'h2',
    'mws-conversation-header'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const name = el?.textContent?.trim();
    if (name && name.length < 80) return name;
  }
  return 'them';
}

function insertIntoCompose(text) {
  log('info', 'Inserting text into compose box…');

  const selectors = [
    'mws-compose-bar textarea',
    'mws-compose-bar [contenteditable="true"]',
    '[data-e2e-compose-input]',
    'textarea[placeholder*="message" i]',
    'div[contenteditable="true"][class*="compose" i]',
    'div[contenteditable="true"]',
    'textarea'
  ];

  let box = null;
  let usedSel = null;

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) { box = el; usedSel = sel; break; }
  }

  if (!box) {
    log('error', 'Compose box not found', { tried: selectors });
    return false;
  }

  log('info', `Found compose box: ${usedSel}`);
  box.focus();

  if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(box, text); else box.value = text;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // contenteditable
    box.textContent = '';
    document.execCommand('insertText', false, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }

  log('info', 'Text inserted successfully');
  return true;
}

// ─── Panel UI ────────────────────────────────────────────────────────────────

function setStatus(msg, level = 'info') {
  const el = document.getElementById('mai-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `mai-status mai-status-${level}`;
}

function getPreviewText() {
  return document.getElementById('mai-preview')?.textContent?.trim() ?? '';
}

async function onGenerate() {
  const genBtn = document.getElementById('mai-generate-btn');
  const sendBtn = document.getElementById('mai-send-btn');
  const preview = document.getElementById('mai-preview');

  genBtn.disabled = true;
  if (preview) preview.textContent = '…thinking';
  if (sendBtn) sendBtn.disabled = true;

  try {
    const behaviorKey = document.getElementById('mai-behavior-select')?.value ?? 'kind';
    const customText = document.getElementById('mai-custom-prompt')?.value?.trim() ?? '';

    let systemPrompt;
    if (behaviorKey === 'custom' && customText) {
      systemPrompt = customText;
    } else if (customText) {
      systemPrompt = BEHAVIORS[behaviorKey].system + '\n\nAdditional instruction: ' + customText;
    } else {
      systemPrompt = BEHAVIORS[behaviorKey].system;
    }

    setStatus('Initializing AI…');
    await buildSession(systemPrompt);

    const messages = readMessages();
    if (messages.length === 0) {
      setStatus('No messages found — open a conversation first', 'warn');
      if (preview) preview.textContent = 'No messages found. Please open a conversation first.';
      return;
    }

    const contact = getContactName();
    const recent = messages.slice(-12);
    const context = recent.map(m => `${m.fromMe ? 'Me' : contact}: ${m.text}`).join('\n');
    const lastFromThem = messages.filter(m => !m.fromMe).pop();

    log('info', 'Building prompt…', {
      contact,
      contextLines: recent.length,
      lastMsg: lastFromThem?.text?.slice(0, 60)
    });

    const prompt = `Conversation with ${contact}:\n\n${context}\n\nWrite my next reply to ${contact}'s last message.`;

    setStatus('Generating…');

    await streamPrompt(prompt, chunk => {
      if (preview) preview.textContent = chunk;
    });

    setStatus('Done! Edit the preview, then click Insert.', 'success');
    if (sendBtn) sendBtn.disabled = false;

  } catch (err) {
    log('error', 'Generation failed', { message: err.message, stack: err.stack });
    setStatus(`Error: ${err.message}`, 'error');
    if (preview) preview.textContent = `Error: ${err.message}`;
  } finally {
    genBtn.disabled = false;
  }
}

function onInsert() {
  const text = getPreviewText();
  const placeholder = 'Click "Generate" to create a reply…';

  if (!text || text === placeholder) {
    setStatus('Nothing to insert — generate a response first', 'warn');
    return;
  }

  const ok = insertIntoCompose(text);
  if (ok) {
    setStatus('Inserted into compose box!', 'success');
  } else {
    setStatus('Could not find compose box — see debug log', 'error');
  }
}

function makeDraggable(panel, handle) {
  let dragging = false, ox = 0, oy = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    handle.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left = `${Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, e.clientX - ox))}px`;
    panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, e.clientY - oy))}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    handle.style.cursor = 'grab';
  });
}

function buildPanel() {
  const old = document.getElementById('mai-panel');
  if (old) old.remove();

  const behaviorOptions = Object.entries(BEHAVIORS)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
    .join('');

  const panel = document.createElement('div');
  panel.id = 'mai-panel';
  panel.className = 'mai-panel';
  panel.innerHTML = `
    <div class="mai-header" id="mai-drag-handle">
      <span class="mai-title">🤖 Messages AI</span>
      <div class="mai-header-btns">
        <button id="mai-minimize-btn" class="mai-icon-btn" title="Minimize">−</button>
        <button id="mai-close-btn" class="mai-icon-btn" title="Close">×</button>
      </div>
    </div>

    <div class="mai-body" id="mai-body">

      <div class="mai-field">
        <label class="mai-label">Response Style</label>
        <select id="mai-behavior-select" class="mai-select">${behaviorOptions}</select>
      </div>

      <div class="mai-field">
        <label class="mai-label">Extra instructions <span class="mai-hint">(optional)</span></label>
        <textarea id="mai-custom-prompt" class="mai-textarea" rows="2"
          placeholder="e.g. Always end with a question, keep it under 20 words…"></textarea>
      </div>

      <button id="mai-generate-btn" class="mai-btn mai-btn-primary">✨ Generate Response</button>

      <div class="mai-field">
        <label class="mai-label">Preview <span class="mai-hint">(editable)</span></label>
        <div id="mai-preview" class="mai-preview" contenteditable="true"
          data-placeholder="Click "Generate" to create a reply…">Click "Generate" to create a reply…</div>
      </div>

      <div id="mai-status" class="mai-status">Ready</div>

      <div class="mai-row">
        <button id="mai-send-btn" class="mai-btn mai-btn-success" disabled>📤 Insert into Chat</button>
        <button id="mai-regen-btn" class="mai-btn mai-btn-secondary">🔄 Regenerate</button>
      </div>

      <div class="mai-debug-wrap">
        <button id="mai-debug-toggle" class="mai-btn mai-btn-ghost">🔍 Debug Log ▼</button>
        <div id="mai-debug-panel" class="mai-debug-panel" hidden>
          <div class="mai-debug-bar">
            <span>Debug Output</span>
            <button id="mai-debug-clear" class="mai-btn-tiny">Clear</button>
          </div>
          <div id="mai-debug-content" class="mai-debug-content"></div>
        </div>
      </div>

    </div>`;

  document.body.appendChild(panel);
  makeDraggable(panel, document.getElementById('mai-drag-handle'));

  // Wire buttons
  document.getElementById('mai-close-btn').onclick = () => {
    panel.remove();
    panelOpen = false;
  };

  document.getElementById('mai-minimize-btn').onclick = () => {
    const body = document.getElementById('mai-body');
    const minBtn = document.getElementById('mai-minimize-btn');
    const minimized = body.style.display === 'none';
    body.style.display = minimized ? '' : 'none';
    minBtn.textContent = minimized ? '−' : '+';
  };

  document.getElementById('mai-generate-btn').onclick = onGenerate;
  document.getElementById('mai-send-btn').onclick = onInsert;
  document.getElementById('mai-regen-btn').onclick = onGenerate;

  document.getElementById('mai-debug-toggle').onclick = () => {
    const dp = document.getElementById('mai-debug-panel');
    const btn = document.getElementById('mai-debug-toggle');
    dp.hidden = !dp.hidden;
    btn.textContent = dp.hidden ? '🔍 Debug Log ▼' : '🔍 Debug Log ▲';
    if (!dp.hidden) refreshDebugUI();
  };

  document.getElementById('mai-debug-clear').onclick = () => {
    debugLogs = [];
    refreshDebugUI();
  };

  // Load saved settings pushed by the bridge (localStorage, MAIN-world safe)
  const savedBehavior = localStorage.getItem('mai_behavior');
  const savedPrompt = localStorage.getItem('mai_customSystemPrompt');
  if (savedBehavior) {
    const sel = document.getElementById('mai-behavior-select');
    if (sel) sel.value = savedBehavior;
  }
  if (savedPrompt) {
    const ta = document.getElementById('mai-custom-prompt');
    if (ta) ta.value = savedPrompt;
  }

  // Listen for future bridge pushes (e.g. popup changed a setting)
  window.addEventListener('mai-storage-push', e => {
    const { behavior, customSystemPrompt } = e.detail ?? {};
    if (behavior) {
      localStorage.setItem('mai_behavior', behavior);
      const sel = document.getElementById('mai-behavior-select');
      if (sel) sel.value = behavior;
    }
    if (customSystemPrompt !== undefined) {
      localStorage.setItem('mai_customSystemPrompt', customSystemPrompt);
      const ta = document.getElementById('mai-custom-prompt');
      if (ta) ta.value = customSystemPrompt;
    }
  });

  // Save settings on change — write to localStorage and tell the bridge to persist
  document.getElementById('mai-behavior-select').onchange = e => {
    localStorage.setItem('mai_behavior', e.target.value);
    window.dispatchEvent(new CustomEvent('mai-save-setting', { detail: { key: 'behavior', value: e.target.value } }));
  };
  document.getElementById('mai-custom-prompt').onchange = e => {
    localStorage.setItem('mai_customSystemPrompt', e.target.value);
    window.dispatchEvent(new CustomEvent('mai-save-setting', { detail: { key: 'customSystemPrompt', value: e.target.value } }));
  };

  // Probe AI on open
  checkAIAvailability().then(status => {
    if (status === 'readily') {
      setStatus('Chrome AI ready', 'success');
      log('info', '✅ Chrome built-in AI is ready');
    } else if (status === 'after-download') {
      setStatus('AI model downloading — please wait…', 'warn');
      log('warn', 'Model needs to download. Try generating in a moment.');
    } else {
      setStatus('Chrome AI unavailable — see debug log', 'error');
      log('error', 'Chrome AI not available', {
        step1: 'Open chrome://flags/#prompt-api-for-gemini-nano → Enabled',
        step2: 'Open chrome://flags/#optimization-guide-on-device-model → Enabled BypassPerfRequirement',
        step3: 'Go to chrome://components → update "Optimization Guide On Device Model"',
        step4: 'Restart Chrome'
      });
    }
  });

  panelOpen = true;
}

// ─── Floating action button ──────────────────────────────────────────────────

function buildFAB() {
  if (document.getElementById('mai-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'mai-fab';
  fab.className = 'mai-fab';
  fab.title = 'Open Messages AI Assistant';
  fab.textContent = '🤖';
  fab.onclick = () => {
    if (panelOpen) {
      document.getElementById('mai-panel')?.remove();
      panelOpen = false;
    } else {
      buildPanel();
    }
  };
  document.body.appendChild(fab);
  log('info', 'FAB added — click 🤖 to open the assistant');
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

function init() {
  buildFAB();
}

// Re-attach FAB on SPA navigation
let lastHref = location.href;
new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    log('info', `Navigation: ${lastHref}`);
    if (!document.getElementById('mai-fab')) buildFAB();
  }
}).observe(document, { subtree: true, childList: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
