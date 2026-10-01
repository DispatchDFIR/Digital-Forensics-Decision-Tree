import { db, doc, setDoc, onSnapshot, serverTimestamp, runTransaction } from './firebase.js?v=4';
import { createDiagram, clearPositions, nudge } from './diagram.js?v=4';
import {
  uid, el, button, editableText, isEditingInside, setStatus,
  enableCanvas, downloadJson, readJsonFile
} from './shared.js?v=4';

const RECENT_KEY = 'mm_recent';
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;

const home = document.getElementById('mm-home');
const workspace = document.getElementById('mm-workspace');
const canvas = document.getElementById('mm-canvas');
const stage = document.getElementById('mm-tree');
const titleSlot = document.getElementById('mm-title-slot');
const codeLabel = document.getElementById('mm-code');
const joinError = document.getElementById('mm-join-error');

let code = null;
let state = null;      // { name, tree }
let pending = null;    // remote update deferred while the user is typing
let unsubscribe = null;
let needsCentre = false;
let focusAfterRender = null;
let diagram = null;

const subNodes = (n) => (n.children || []).map((c) => ({ node: c }));

export function initMindMaps() {
  document.getElementById('mm-create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('mm-create-name');
    const name = input.value.trim().slice(0, 120) || 'Untitled mind map';
    const newCode = generateCode();
    setStatus('Creating…');
    try {
      await setDoc(doc(db, 'mindmaps', newCode), {
        name,
        tree: { id: uid(), text: name, label: '', children: [] },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      input.value = '';
      setStatus('Created', true);
      openMap(newCode);
    } catch (err) {
      console.error(err);
      setStatus('Could not create mind map');
    }
  });

  document.getElementById('mm-join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('mm-join-code');
    const parsed = parseCode(input.value);
    if (!parsed) {
      showJoinError(`That doesn't look like a valid share code (it should be ${CODE_LENGTH} letters/numbers).`);
      return;
    }
    input.value = '';
    openMap(parsed);
  });

  document.getElementById('mm-back').addEventListener('click', closeMap);
  document.getElementById('mm-copy-link').addEventListener('click', () => copyText(inviteLink(), 'Invite link copied'));
  document.getElementById('mm-copy-code').addEventListener('click', () => copyText(formatCode(code), 'Code copied'));
  document.getElementById('mm-print').addEventListener('click', () => window.print());
  document.getElementById('mm-export').addEventListener('click', () => {
    if (!state) return;
    const slug = state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mind-map';
    downloadJson({ name: state.name, tree: state.tree }, `${slug}.json`);
  });
  document.getElementById('mm-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !state) return;
    try {
      const data = await readJsonFile(file);
      const tree = data && data.tree ? data.tree : data;
      if (!tree || typeof tree.text !== 'string' || !Array.isArray(tree.children)) throw new Error('bad shape');
      if (!confirm('Replace this whole mind map with the imported file? Everyone with the code will see the change.')) return;
      const name = typeof data.name === 'string' ? data.name.slice(0, 120) : state.name;
      mutate((s) => { s.tree = tree; s.name = name; });
    } catch {
      alert('That file is not a valid mind map export.');
    }
  });

  document.getElementById('mm-arrange').addEventListener('click', () => {
    if (!state) return;
    if (!confirm('Put every box back in its automatic position? Everyone with the code will see the change.')) return;
    mutate((s) => clearPositions(s.tree, subNodes));
  });

  // Apply remote changes that arrived while this user was typing or dragging.
  const applyPending = () => setTimeout(() => {
    if (pending && !isEditingInside(workspace) && !diagram.isDragging()) {
      state = pending;
      pending = null;
      render();
    }
  }, 0);
  workspace.addEventListener('focusout', applyPending);
  canvas.addEventListener('pointerup', applyPending);

  const zoom = enableCanvas(canvas, stage, document.getElementById('mm-zoom'));
  diagram = createDiagram({
    canvas, stage, zoom,
    childrenOf: (node) => node.children.map((c) => ({ node: c, kind: 'custom', label: renderLabel(c) })),
    renderBox: (spec) => renderBox(spec.node),
    canDrag: () => !!state,
    onMove: (nodes, dx, dy) => {
      const ids = nodes.map((n) => n.id);
      mutate((s) => {
        for (const id of ids) {
          const n = findNode(s.tree, id);
          if (n) nudge(n, dx, dy);
        }
      }, { rerender: false });
    }
  });
  renderRecent();
}

export function openMap(newCode) {
  if (unsubscribe) unsubscribe();
  code = newCode;
  state = null;
  pending = null;
  needsCentre = true;
  hideJoinError();
  history.replaceState(null, '', `${location.pathname}?map=${code}`);
  home.hidden = true;
  workspace.hidden = false;
  codeLabel.textContent = formatCode(code);
  render();

  const openedCode = code;
  unsubscribe = onSnapshot(doc(db, 'mindmaps', code), (snap) => {
    if (openedCode !== code) return;
    if (!snap.exists()) {
      forgetRecent(openedCode);
      closeMap();
      showJoinError('No mind map was found for that code. Check it was typed correctly.');
      return;
    }
    const data = snap.data();
    const next = { name: data.name || 'Untitled mind map', tree: data.tree };
    rememberRecent(openedCode, next.name);
    if (isEditingInside(workspace) || diagram.isDragging()) {
      pending = next;
      return;
    }
    state = next;
    render();
  }, (err) => {
    console.error(err);
    closeMap();
    showJoinError(err.code === 'permission-denied'
      ? 'That share code was not accepted.'
      : 'Could not load the mind map. Check your connection and try again.');
  });
}

export function refreshLayout() {
  diagram.refresh();
  if (needsCentre && state) needsCentre = !diagram.centre();
}

function closeMap() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  code = null;
  state = null;
  pending = null;
  history.replaceState(null, '', location.pathname);
  workspace.hidden = true;
  home.hidden = false;
  renderRecent();
}

// Each edit is an operation applied locally for instant feedback and then re-applied
// inside a transaction against the latest server copy, so concurrent edits to
// different boxes merge instead of overwriting each other.
function mutate(op, { rerender = true } = {}) {
  if (!state) return;
  if (pending) {
    state = pending;
    pending = null;
    rerender = true;
  }
  op(state);
  if (rerender) render();

  const ref = doc(db, 'mindmaps', code);
  setStatus('Saving…');
  runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('missing');
    const server = { name: snap.data().name, tree: snap.data().tree };
    op(server);
    tx.update(ref, { name: server.name, tree: server.tree, updatedAt: serverTimestamp() });
  }).then(() => setStatus('Saved', true)).catch((err) => {
    console.error(err);
    setStatus('Save failed – check your connection');
  });
}

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

function findParent(node, id) {
  for (const child of node.children || []) {
    if (child.id === id) return node;
    const hit = findParent(child, id);
    if (hit) return hit;
  }
  return null;
}

function render() {
  titleSlot.innerHTML = '';
  if (state) {
    titleSlot.appendChild(editableText('mm-title', state.name, 'Untitled mind map', true, (value) => {
      const name = (value || 'Untitled mind map').slice(0, 120);
      mutate((s) => { s.name = name; }, { rerender: false });
      rememberRecent(code, name);
    }));
  }

  if (!state) {
    diagram.clear('Loading…');
    return;
  }
  diagram.render(state.tree);
  if (needsCentre) needsCentre = !diagram.centre();

  if (focusAfterRender) {
    const target = stage.querySelector(`[data-node-id="${focusAfterRender}"] .node-text`);
    focusAfterRender = null;
    if (target) target.focus();
  }
}

function renderLabel(node) {
  const id = node.id;
  return editableText('edge-label custom', node.label, '+ label', true, (value) => {
    mutate((s) => { const n = findNode(s.tree, id); if (n) n.label = value.slice(0, 80); }, { rerender: false });
  });
}

function renderBox(node) {
  const id = node.id;
  const isRoot = id === state.tree.id;
  const box = el('div', isRoot ? 'node topic central' : 'node topic');
  box.dataset.nodeId = id;
  const head = el('div', 'node-head');
  head.appendChild(el('span', null, isRoot ? 'Central topic' : 'Topic'));
  const tools = el('span', 'head-tools');
  if (node.pos) {
    tools.appendChild(button('⟲', 'icon-btn', () => {
      mutate((s) => { const n = findNode(s.tree, id); if (n) delete n.pos; });
    }, 'Put this box back in its automatic position'));
  }
  if (!isRoot) {
    tools.appendChild(button('✕', 'icon-btn danger', () => {
      if (node.children.length && !confirm('Delete this box and everything below it?')) return;
      mutate((s) => {
        const parent = findParent(s.tree, id);
        if (parent) parent.children = parent.children.filter((c) => c.id !== id);
      });
    }, 'Delete this box and everything below it'));
  }
  head.appendChild(tools);
  box.appendChild(head);

  box.appendChild(editableText('node-text', node.text, 'Type here…', true, (value) => {
    mutate((s) => { const n = findNode(s.tree, id); if (n) n.text = value; }, { rerender: false });
  }));

  const controls = el('div', 'node-controls');
  controls.appendChild(button('+ Child', null, () => {
    const child = { id: uid(), text: '', label: '', children: [] };
    focusAfterRender = child.id;
    mutate((s) => {
      const n = findNode(s.tree, id);
      if (n) n.children.push(structuredClone(child));
    });
  }, 'Add a branch below this box'));
  box.appendChild(controls);
  return box;
}

function generateCode() {
  const bytes = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function parseCode(input) {
  let raw = (input || '').trim();
  const match = raw.match(/[?&]map=([^&#\s]+)/);
  if (match) raw = decodeURIComponent(match[1]);
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length === CODE_LENGTH && [...cleaned].every((c) => CODE_ALPHABET.includes(c)) ? cleaned : null;
}

export function parseCodeFromUrl() {
  const value = new URLSearchParams(location.search).get('map');
  return value ? parseCode(value) : null;
}

function formatCode(c) {
  return c ? `${c.slice(0, 5)}-${c.slice(5)}` : '';
}

function inviteLink() {
  return `${location.origin}${location.pathname}?map=${code}`;
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(message, true);
  } catch {
    prompt('Copy this:', text);
  }
}

function showJoinError(message) {
  joinError.textContent = message;
  joinError.hidden = false;
}

function hideJoinError() {
  joinError.hidden = true;
}

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}

function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch {}
}

function rememberRecent(c, name) {
  const list = loadRecent().filter((r) => r.code !== c);
  list.unshift({ code: c, name, ts: Date.now() });
  saveRecent(list);
}

function forgetRecent(c) {
  saveRecent(loadRecent().filter((r) => r.code !== c));
}

function renderRecent() {
  const list = loadRecent();
  const card = document.getElementById('mm-recent-card');
  const ul = document.getElementById('mm-recent');
  ul.innerHTML = '';
  card.hidden = list.length === 0;
  for (const r of list) {
    const li = el('li');
    const open = button('', 'recent-open', () => openMap(r.code));
    open.appendChild(el('span', 'recent-name', r.name));
    open.appendChild(el('code', null, formatCode(r.code)));
    li.appendChild(open);
    li.appendChild(button('✕', 'icon-btn', () => { forgetRecent(r.code); renderRecent(); }, 'Remove from this list (does not delete the mind map)'));
    ul.appendChild(li);
  }
}
