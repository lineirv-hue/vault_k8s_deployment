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
    system: ''
  }
};

// ─── State ──────────────────────────────────────────────────────────────────

let debugLogs = [];
let panelOpen = false;

// ─── DOM helper (no innerHTML — Trusted Types safe) ─────────────────────────

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      switch (k) {
        case 'className':       node.className = v; break;
        case 'id':              node.id = v; break;
        case 'textContent':     node.textContent = v; break;
        case 'title':           node.title = v; break;
        case 'disabled':        node.disabled = v; break;
        case 'hidden':          node.hidden = v; break;
        case 'rows':            node.rows = v; break;
        case 'placeholder':     node.placeholder = v; break;
        case 'contentEditable': node.contentEditable = v; break;
        case 'value':           node.value = v; break;
        case 'style':           Object.assign(node.style, v); break;
        default:                node.setAttribute(k, v);
      }
    }
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

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
  const container = document.getElementById('mai-debug-content');
  if (!container) return;
  container.textContent = '';
  const entries = debugLogs.slice().reverse().slice(0, 50);
  if (!entries.length) {
    container.appendChild(el('div', { style: { color: '#858585' } }, 'No logs yet.'));
    return;
  }
  for (const e of entries) {
    const color = e.level === 'error' ? '#ff6b6b' : e.level === 'warn' ? '#ffd93d' : '#6bcb77';
    const row = el('div', { className: 'mai-log-row' },
      el('span', { className: 'mai-log-ts' }, e.ts),
      el('span', { className: 'mai-log-lvl', style: { color } }, `[${e.level.toUpperCase()}]`),
      el('span', { className: 'mai-log-msg' }, e.msg)
    );
    if (e.data != null) {
      row.appendChild(el('pre', { className: 'mai-log-data' }, JSON.stringify(e.data, null, 2)));
    }
    container.appendChild(row);
  }
}

// ─── Ollama via CustomEvent bridge (chrome.runtime lives in isolated world) ──
// content.js runs in MAIN world — no chrome.* APIs available here.
// We dispatch CustomEvents that content-bridge.js (isolated world) handles,
// and it relays chunks back as CustomEvents.

function generateWithOllama(systemPrompt, prompt, model, onChunk) {
  return new Promise((resolve, reject) => {
    // Cancel any in-flight generation
    window.dispatchEvent(new CustomEvent('mai-generate-cancel'));

    const onChunkEvt = e => onChunk(e.detail.text);
    const onDoneEvt  = e => { cleanup(); resolve(e.detail.text); };
    const onErrorEvt = e => { cleanup(); reject(new Error(e.detail.message)); };

    function cleanup() {
      window.removeEventListener('mai-generate-chunk', onChunkEvt);
      window.removeEventListener('mai-generate-done',  onDoneEvt);
      window.removeEventListener('mai-generate-error', onErrorEvt);
    }

    window.addEventListener('mai-generate-chunk', onChunkEvt);
    window.addEventListener('mai-generate-done',  onDoneEvt);
    window.addEventListener('mai-generate-error', onErrorEvt);

    window.dispatchEvent(new CustomEvent('mai-generate-request', {
      detail: { systemPrompt, prompt, model }
    }));
  });
}

function checkOllamaStatus() {
  return new Promise(resolve => {
    const onResult = e => {
      window.removeEventListener('mai-ollama-result', onResult);
      resolve(e.detail);
    };
    window.addEventListener('mai-ollama-result', onResult);
    window.dispatchEvent(new CustomEvent('mai-ollama-check'));
    setTimeout(() => {
      window.removeEventListener('mai-ollama-result', onResult);
      resolve({ ok: false, error: 'Bridge timeout — extension may need reload' });
    }, 5000);
  });
}

// ─── Conversation list (sidebar) ────────────────────────────────────────────

function readConversationList() {
  const selectors = [
    'mws-conversation-list-item',
    '[data-e2e-conversation-id]',
    '.conv-container',
    'mws-conversations-list .mat-list-item'
  ];

  let items = null, usedSel = null;
  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) { items = found; usedSel = sel; break; }
  }

  if (!items) {
    log('warn', 'Could not find conversation list in sidebar');
    return [];
  }

  log('info', `Sidebar: ${items.length} conversations via ${usedSel}`);

  const conversations = [];
  items.forEach((item, idx) => {
    const nameSelectors = ['.contact-name', 'h3', '[data-e2e-conversation-name]', '.name', 'span'];
    let name = null;
    for (const sel of nameSelectors) {
      const node = item.querySelector(sel);
      const t = node?.textContent?.trim();
      if (t && t.length > 0 && t.length < 80) { name = t; break; }
    }
    if (!name) name = item.textContent?.trim()?.split('\n')[0]?.trim();
    if (!name) return;

    const id = item.getAttribute('data-e2e-conversation-id')
      ?? item.getAttribute('data-conversation-id')
      ?? `conv-${idx}`;

    conversations.push({ name, id });
  });

  return conversations;
}

function getAllowedConvs() {
  try { return JSON.parse(localStorage.getItem('mai_allowed_convs') || '[]'); }
  catch (_) { return []; }
}

function saveAllowedConvs(list) {
  localStorage.setItem('mai_allowed_convs', JSON.stringify(list));
}

function refreshConvList() {
  const container = document.getElementById('mai-conv-list');
  if (!container) return;

  container.textContent = '';
  const conversations = readConversationList();
  const allowed = getAllowedConvs();

  if (conversations.length === 0) {
    container.appendChild(el('div', { className: 'mai-conv-empty' },
      'No conversations found — make sure the sidebar is visible'));
    return;
  }

  conversations.forEach(conv => {
    const cbId = `mai-cb-${conv.id}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = cbId;
    checkbox.className = 'mai-conv-checkbox';
    checkbox.checked = allowed.includes(conv.name);

    checkbox.onchange = () => {
      const current = getAllowedConvs();
      if (checkbox.checked) {
        if (!current.includes(conv.name)) current.push(conv.name);
      } else {
        const i = current.indexOf(conv.name);
        if (i > -1) current.splice(i, 1);
      }
      saveAllowedConvs(current);
    };

    const lbl = el('label', { className: 'mai-conv-label' }, conv.name);
    lbl.setAttribute('for', cbId);

    container.appendChild(el('div', { className: 'mai-conv-item' }, checkbox, lbl));
  });
}

// ─── DOM helpers for Google Messages ────────────────────────────────────────

function readMessages() {
  log('info', 'Reading conversation messages…');
  const selectors = [
    'mws-message-part-content',
    'mws-text-message-part',
    '[data-e2e-is-from-me]',
    '.message-wrapper',
    '.msg-container'
  ];
  let elements = null, usedSelector = null;
  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) { elements = found; usedSelector = sel; break; }
  }
  if (!elements) {
    log('warn', 'Precise selectors found nothing — trying broad fallback');
    const container = document.querySelector('mws-messages-list, .messages-container, main');
    if (container) {
      const texts = [];
      container.querySelectorAll('p, span').forEach(node => {
        const t = node.textContent?.trim();
        if (t && t.length > 2 && t.length < 2000) texts.push({ text: t, fromMe: false });
      });
      log('info', `Fallback found ${texts.length} text fragments`);
      return texts;
    }
    log('error', 'Could not read messages — DOM structure unrecognized');
    return [];
  }
  log('info', `Using selector: ${usedSelector}`, { count: elements.length });
  const messages = [];
  elements.forEach(node => {
    const text = node.textContent?.trim();
    if (!text) return;
    let fromMe = false;
    const ancestor = node.closest('[data-e2e-is-from-me]');
    if (ancestor) {
      fromMe = ancestor.getAttribute('data-e2e-is-from-me') === 'true';
    } else {
      const classChain = [node, node.parentElement, node.parentElement?.parentElement]
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
  const selectors = ['mws-conversation-header h2', '[data-e2e-conversation-name]', '.contact-name', 'h2'];
  for (const sel of selectors) {
    const name = document.querySelector(sel)?.textContent?.trim();
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
    'div[contenteditable="true"]',
    'textarea'
  ];
  let box = null, usedSel = null;
  for (const sel of selectors) {
    const found = document.querySelector(sel);
    if (found) { box = found; usedSel = sel; break; }
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
    box.dispatchEvent(new Event('input',  { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    box.textContent = '';
    document.execCommand('insertText', false, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }
  log('info', 'Text inserted successfully');
  return true;
}

// ─── Panel UI ────────────────────────────────────────────────────────────────

function setStatus(msg, level = 'info') {
  const node = document.getElementById('mai-status');
  if (!node) return;
  node.textContent = msg;
  node.className = `mai-status mai-status-${level}`;
}

function getPreviewText() {
  return document.getElementById('mai-preview')?.textContent?.trim() ?? '';
}

async function onGenerate() {
  const genBtn  = document.getElementById('mai-generate-btn');
  const sendBtn = document.getElementById('mai-send-btn');
  const preview = document.getElementById('mai-preview');

  genBtn.disabled = true;
  if (preview)  preview.textContent  = '…thinking';
  if (sendBtn)  sendBtn.disabled = true;

  try {
    const behaviorKey  = document.getElementById('mai-behavior-select')?.value ?? 'kind';
    const customText   = document.getElementById('mai-custom-prompt')?.value?.trim() ?? '';
    const model        = localStorage.getItem('mai_ollamaModel') || 'llama3.2';

    let systemPrompt;
    if (behaviorKey === 'custom' && customText) {
      systemPrompt = customText;
    } else if (customText) {
      systemPrompt = BEHAVIORS[behaviorKey].system + '\n\nAdditional instruction: ' + customText;
    } else {
      systemPrompt = BEHAVIORS[behaviorKey].system;
    }

    // Check allowed conversations (empty list = all allowed)
    const allowed = getAllowedConvs();
    const contact = getContactName();
    if (allowed.length > 0 && !allowed.includes(contact)) {
      setStatus(`"${contact}" is not in your allowed list`, 'warn');
      if (preview) preview.textContent = `This conversation ("${contact}") is not enabled. Check it in the Allowed Conversations list.`;
      return;
    }

    setStatus('Connecting to Ollama…');
    log('info', `Using model: ${model}`);

    const messages = readMessages();
    if (messages.length === 0) {
      setStatus('No messages found — open a conversation first', 'warn');
      if (preview) preview.textContent = 'No messages found. Please open a conversation first.';
      return;
    }

    const recent  = messages.slice(-12);
    const context = recent.map(m => `${m.fromMe ? 'Me' : contact}: ${m.text}`).join('\n');

    log('info', 'Building prompt…', { contact, contextLines: recent.length });

    const prompt = `Conversation with ${contact}:\n\n${context}\n\nWrite my next reply to ${contact}'s last message.`;
    setStatus('Generating…');

    await generateWithOllama(systemPrompt, prompt, model, chunk => {
      if (preview) preview.textContent = chunk;
    });

    setStatus('Done! Edit the preview, then click Insert.', 'success');
    if (sendBtn) sendBtn.disabled = false;

  } catch (err) {
    log('error', 'Generation failed', { message: err.message });
    setStatus(`Error: ${err.message}`, 'error');
    if (preview) preview.textContent = `Error: ${err.message}`;
  } finally {
    genBtn.disabled = false;
  }
}

function onInsert() {
  const text = getPreviewText();
  if (!text || text === 'Click "Generate" to create a reply…') {
    setStatus('Nothing to insert — generate a response first', 'warn');
    return;
  }
  const ok = insertIntoCompose('My AI Response: ' + text);
  if (ok) setStatus('Inserted into compose box!', 'success');
  else    setStatus('Could not find compose box — see debug log', 'error');
}

function makeDraggable(panel, handle) {
  let dragging = false, ox = 0, oy = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true;
    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    handle.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left   = `${Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  e.clientX - ox))}px`;
    panel.style.top    = `${Math.max(0, Math.min(window.innerHeight - 60, e.clientY - oy))}px`;
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => { dragging = false; handle.style.cursor = 'grab'; });
}

function labelWithHint(text, hint) {
  const lbl = el('label', { className: 'mai-label' }, text);
  lbl.appendChild(el('span', { className: 'mai-hint' }, hint));
  return lbl;
}

function buildPanel() {
  console.log('[MsgAI] buildPanel() called');
  document.getElementById('mai-panel')?.remove();
  if (!document.body) { console.error('[MsgAI] buildPanel: no body'); return; }

  // ── Behavior select ──
  const behaviorSel = el('select', { id: 'mai-behavior-select', className: 'mai-select' });
  for (const [k, v] of Object.entries(BEHAVIORS)) {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = v.label;
    behaviorSel.appendChild(opt);
  }

  // ── Model input ──
  const modelInput = el('input', {
    id: 'mai-model-input',
    className: 'mai-textarea',
    placeholder: 'e.g. llama3.2, mistral, gemma2…',
    value: localStorage.getItem('mai_ollamaModel') || 'llama3.2'
  });
  modelInput.type = 'text';

  // ── Custom prompt ──
  const customPrompt = el('textarea', {
    id: 'mai-custom-prompt', className: 'mai-textarea', rows: 2,
    placeholder: 'e.g. Always end with a question, keep it under 20 words…'
  });

  // ── Buttons ──
  const generateBtn = el('button', { id: 'mai-generate-btn', className: 'mai-btn mai-btn-primary' }, '✨ Generate Response');
  const sendBtn     = el('button', { id: 'mai-send-btn',     className: 'mai-btn mai-btn-success',  disabled: true }, '📤 Insert into Chat');
  const regenBtn    = el('button', { id: 'mai-regen-btn',    className: 'mai-btn mai-btn-secondary' }, '🔄 Regenerate');

  // ── Preview ──
  const preview = el('div', { id: 'mai-preview', className: 'mai-preview', contentEditable: 'true' },
    'Click "Generate" to create a reply…');

  // ── Status ──
  const status = el('div', { id: 'mai-status', className: 'mai-status' }, 'Checking Ollama…');

  // ── Debug ──
  const debugContent = el('div', { id: 'mai-debug-content', className: 'mai-debug-content' });
  const debugClearBtn = el('button', { id: 'mai-debug-clear', className: 'mai-btn-tiny' }, 'Clear');
  const debugPanel = el('div', { id: 'mai-debug-panel', className: 'mai-debug-panel', hidden: true },
    el('div', { className: 'mai-debug-bar' }, el('span', null, 'Debug Output'), debugClearBtn),
    debugContent
  );
  const debugToggle = el('button', { id: 'mai-debug-toggle', className: 'mai-btn mai-btn-ghost' }, '🔍 Debug Log ▼');

  // ── Header ──
  const minBtn   = el('button', { id: 'mai-minimize-btn', className: 'mai-icon-btn', title: 'Minimize' }, '−');
  const closeBtn = el('button', { id: 'mai-close-btn',   className: 'mai-icon-btn', title: 'Close'    }, '×');
  const header   = el('div', { id: 'mai-drag-handle', className: 'mai-header' },
    el('span', { className: 'mai-title' }, '🤖 Messages AI'),
    el('div',  { className: 'mai-header-btns' }, minBtn, closeBtn)
  );

  // ── Conversation filter ──
  const convList = el('div', { id: 'mai-conv-list', className: 'mai-conv-list' });
  const refreshConvBtn  = el('button', { className: 'mai-btn-sm' }, '↺ Refresh');
  const selectAllConvBtn = el('button', { className: 'mai-btn-sm' }, 'All');
  const clearAllConvBtn  = el('button', { className: 'mai-btn-sm' }, 'None');

  refreshConvBtn.onclick  = refreshConvList;
  selectAllConvBtn.onclick = () => {
    document.querySelectorAll('.mai-conv-checkbox').forEach(cb => {
      cb.checked = true; cb.dispatchEvent(new Event('change'));
    });
  };
  clearAllConvBtn.onclick = () => {
    document.querySelectorAll('.mai-conv-checkbox').forEach(cb => {
      cb.checked = false; cb.dispatchEvent(new Event('change'));
    });
    saveAllowedConvs([]);
  };

  const convHint = el('span', { className: 'mai-hint' }, ' (empty = all)');
  const convLbl  = el('label', { className: 'mai-label' }, 'Allowed Conversations');
  convLbl.appendChild(convHint);

  const convSection = el('div', { className: 'mai-field' },
    convLbl,
    convList,
    el('div', { className: 'mai-conv-btns' }, selectAllConvBtn, clearAllConvBtn, refreshConvBtn)
  );

  // ── Body ──
  const body = el('div', { id: 'mai-body', className: 'mai-body' },
    convSection,
    el('div', { className: 'mai-field' }, el('label', { className: 'mai-label' }, 'Response Style'), behaviorSel),
    el('div', { className: 'mai-field' }, el('label', { className: 'mai-label' }, 'Ollama Model'), modelInput),
    el('div', { className: 'mai-field' }, labelWithHint('Extra instructions ', '(optional)'), customPrompt),
    generateBtn,
    el('div', { className: 'mai-field' }, labelWithHint('Preview ', '(editable)'), preview),
    status,
    el('div', { className: 'mai-row' }, sendBtn, regenBtn),
    el('div', { className: 'mai-debug-wrap' }, debugToggle, debugPanel)
  );

  const panel = el('div', { id: 'mai-panel', className: 'mai-panel' }, header, body);
  document.body.appendChild(panel);
  makeDraggable(panel, header);

  // ── Event wiring ──
  closeBtn.onclick = () => { panel.remove(); panelOpen = false; };
  minBtn.onclick = () => {
    const min = body.style.display === 'none';
    body.style.display = min ? '' : 'none';
    minBtn.textContent = min ? '−' : '+';
  };
  generateBtn.onclick = onGenerate;
  sendBtn.onclick     = onInsert;
  regenBtn.onclick    = onGenerate;
  debugToggle.onclick = () => {
    debugPanel.hidden = !debugPanel.hidden;
    debugToggle.textContent = debugPanel.hidden ? '🔍 Debug Log ▼' : '🔍 Debug Log ▲';
    if (!debugPanel.hidden) refreshDebugUI();
  };
  debugClearBtn.onclick = () => { debugLogs = []; refreshDebugUI(); };

  // ── Persist model choice ──
  modelInput.onchange = e => {
    const v = e.target.value.trim();
    if (v) {
      localStorage.setItem('mai_ollamaModel', v);
      window.dispatchEvent(new CustomEvent('mai-save-setting', { detail: { key: 'ollamaModel', value: v } }));
    }
  };

  // ── Load saved settings ──
  const savedBehavior = localStorage.getItem('mai_behavior');
  const savedPrompt   = localStorage.getItem('mai_customSystemPrompt');
  if (savedBehavior) behaviorSel.value   = savedBehavior;
  if (savedPrompt)   customPrompt.value  = savedPrompt;

  window.addEventListener('mai-storage-push', e => {
    const d = e.detail ?? {};
    if (d.behavior)            { localStorage.setItem('mai_behavior',           d.behavior);            behaviorSel.value  = d.behavior; }
    if (d.customSystemPrompt)  { localStorage.setItem('mai_customSystemPrompt', d.customSystemPrompt);  customPrompt.value = d.customSystemPrompt; }
    if (d.ollamaModel)         { localStorage.setItem('mai_ollamaModel',        d.ollamaModel);         modelInput.value   = d.ollamaModel; }
  });

  behaviorSel.onchange = e => {
    localStorage.setItem('mai_behavior', e.target.value);
    window.dispatchEvent(new CustomEvent('mai-save-setting', { detail: { key: 'behavior', value: e.target.value } }));
  };
  customPrompt.onchange = e => {
    localStorage.setItem('mai_customSystemPrompt', e.target.value);
    window.dispatchEvent(new CustomEvent('mai-save-setting', { detail: { key: 'customSystemPrompt', value: e.target.value } }));
  };

  // ── Populate conversation list ──
  setTimeout(refreshConvList, 300);

  // ── Check Ollama on open ──
  checkOllamaStatus().then(result => {
    if (result.ok) {
      const modelList = result.models?.join(', ') || '(none pulled yet)';
      setStatus(`Ollama ready ✅  |  models: ${modelList}`, 'success');
      log('info', 'Ollama is running', { models: result.models });
    } else {
      setStatus('Ollama not reachable — run: ollama serve', 'error');
      log('error', 'Ollama unreachable', { error: result.error });
    }
  });

  panelOpen = true;
}

// ─── Floating action button ──────────────────────────────────────────────────

function buildFAB() {
  if (document.getElementById('mai-fab')) return;
  const target = document.body ?? document.documentElement;
  if (!target) { console.warn('[MsgAI] No mount target yet, will retry…'); return; }

  const fab = el('button', { id: 'mai-fab', className: 'mai-fab', title: 'Open Messages AI Assistant' }, '🤖');
  fab.onclick = () => {
    try {
      if (panelOpen) { document.getElementById('mai-panel')?.remove(); panelOpen = false; }
      else buildPanel();
    } catch (e) { console.error('[MsgAI] FAB click error:', e); }
  };
  target.appendChild(fab);
  console.log('[MsgAI] ✅ FAB mounted — click 🤖 to open');
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

function tryInit() {
  try { buildFAB(); } catch (e) { console.error('[MsgAI] init error:', e); }
}

setInterval(() => { if (!document.getElementById('mai-fab')) tryInit(); }, 1500);

let lastHref = location.href;
new MutationObserver(() => {
  if (location.href !== lastHref) { lastHref = location.href; tryInit(); }
}).observe(document, { subtree: true, childList: true });

tryInit();
setTimeout(tryInit, 300);
setTimeout(tryInit, 1000);
setTimeout(tryInit, 3000);
