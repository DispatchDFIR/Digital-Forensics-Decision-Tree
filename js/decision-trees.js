import { db, doc, setDoc, onSnapshot, serverTimestamp } from './firebase.js?v=4';
import { TREES, findTree } from './official-trees.js?v=4';
import { createDiagram, clearPositions, nudge } from './diagram.js?v=4';
import {
  uid, el, button, editableText, isEditingInside, setStatus,
  enableCanvas, downloadJson, readJsonFile
} from './shared.js?v=4';

const LAST_TREE_KEY = 'dt_last_tree';

const canvas = document.getElementById('dt-canvas');
const stage = document.getElementById('dt-tree');
const select = document.getElementById('dt-select');
const modePill = document.getElementById('dt-mode');

let currentId = null;
let tree = null;
let isAdmin = false;
let unsubscribe = null;
let saveTimer = null;
let needsCentre = false;
let diagram = null;

export function initDecisionTrees() {
  const groups = new Map();
  for (const t of TREES) {
    if (!groups.has(t.group)) {
      const og = document.createElement('optgroup');
      og.label = t.group;
      groups.set(t.group, og);
      select.appendChild(og);
    }
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    groups.get(t.group).appendChild(opt);
  }
  select.addEventListener('change', () => selectTree(select.value));

  document.getElementById('dt-export').addEventListener('click', () => {
    if (tree) downloadJson(tree, `${currentId}.json`);
  });
  document.getElementById('dt-print').addEventListener('click', () => window.print());
  document.getElementById('dt-reset').addEventListener('click', () => {
    if (!isAdmin) return;
    if (!confirm('Replace this tree with the original starter content? This is saved for everyone.')) return;
    tree = findTree(currentId).starter();
    save();
    render();
  });
  document.getElementById('dt-arrange').addEventListener('click', () => {
    if (!isAdmin || !tree) return;
    if (!confirm('Put every box back in its automatic position? This is saved for everyone.')) return;
    clearPositions(tree, childrenOf);
    save();
    render();
  });
  document.getElementById('dt-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    try {
      const data = await readJsonFile(file);
      if (!data || !['question', 'action'].includes(data.type)) throw new Error('bad shape');
      if (!confirm(`Replace "${findTree(currentId).name}" with the imported file? This is saved for everyone.`)) return;
      tree = data;
      save();
      render();
    } catch {
      alert('That file is not a valid decision tree export.');
    }
  });

  const zoom = enableCanvas(canvas, stage, document.getElementById('dt-zoom'));
  diagram = createDiagram({
    canvas, stage, zoom, childrenOf,
    renderBox: (spec) => (spec.node ? renderNode(spec.node, spec.parentNode, spec.slot) : renderEmptySlot(spec.parentNode, spec.slot)),
    canDrag: () => isAdmin,
    onMove: (nodes, dx, dy) => {
      for (const n of nodes) nudge(n, dx, dy);
      save();
    }
  });

  let initial = null;
  try { initial = localStorage.getItem(LAST_TREE_KEY); } catch {}
  selectTree(findTree(initial) ? initial : TREES[0].id);
}

export function setAdmin(value) {
  if (isAdmin === value) return;
  isAdmin = value;
  render();
}

export function refreshLayout() {
  diagram.refresh();
  if (needsCentre && tree) needsCentre = !diagram.centre();
}

// Questions branch to Yes/No; an action can continue to one `next` box via a plain arrow.
function childrenOf(node) {
  if (node.type === 'question') {
    return ['yes', 'no'].map((slot) => ({
      node: node[slot] || null,
      kind: slot,
      label: el('div', `edge-label ${slot}`, slot === 'yes' ? 'Yes' : 'No'),
      parentNode: node,
      slot
    }));
  }
  if (node.next) return [{ node: node.next, kind: 'next', label: null, parentNode: node, slot: 'next' }];
  return [];
}

function selectTree(id) {
  currentId = id;
  select.value = id;
  try { localStorage.setItem(LAST_TREE_KEY, id); } catch {}
  if (unsubscribe) unsubscribe();
  clearTimeout(saveTimer);
  tree = null;
  needsCentre = true;
  render();

  unsubscribe = onSnapshot(doc(db, 'officialTrees', id), (snap) => {
    if (id !== currentId) return;
    // Our own unsent writes echo back immediately; the UI already reflects them.
    if (snap.metadata.hasPendingWrites) return;
    if (isEditingInside(canvas) || diagram.isDragging()) return;
    tree = snap.exists() ? snap.data().tree : findTree(id).starter();
    render();
  }, (err) => {
    console.error(err);
    setStatus('Offline – showing starter content');
    tree = findTree(id).starter();
    render();
  });
}

function save() {
  setStatus('Saving…');
  clearTimeout(saveTimer);
  const id = currentId;
  saveTimer = setTimeout(async () => {
    try {
      await setDoc(doc(db, 'officialTrees', id), { tree, updatedAt: serverTimestamp() });
      setStatus('Saved', true);
    } catch (err) {
      console.error(err);
      setStatus(err.code === 'permission-denied' ? 'Not allowed – sign in as admin' : 'Save failed');
    }
  }, 300);
}

function render() {
  modePill.textContent = isAdmin ? 'Editing' : 'View only';
  modePill.classList.toggle('editing', isAdmin);
  if (!tree) {
    diagram.clear('Loading…');
    return;
  }
  diagram.render(tree);
  if (needsCentre) needsCentre = !diagram.centre();
}

function renderNode(node, parent, slot) {
  const box = el('div', `node ${node.type}`);
  const head = el('div', 'node-head');
  head.appendChild(el('span', null, node.type === 'question' ? 'Question' : 'Action'));
  if (isAdmin) {
    const tools = el('span', 'head-tools');
    if (node.pos) {
      tools.appendChild(button('⟲', 'icon-btn', () => {
        delete node.pos;
        save();
        render();
      }, 'Put this box back in its automatic position'));
    }
    if (parent) {
      tools.appendChild(button('✕', 'icon-btn danger', () => {
        if (!confirm('Delete this box and everything below it?')) return;
        parent[slot] = null;
        save();
        render();
      }, 'Delete this box and everything below it'));
    }
    head.appendChild(tools);
  }
  box.appendChild(head);

  box.appendChild(editableText(
    'node-text', node.text,
    node.type === 'question' ? 'Type the yes/no question…' : 'Type the action to take…',
    isAdmin,
    (value) => { node.text = value; save(); }
  ));

  if (isAdmin) {
    const controls = el('div', 'node-controls');
    if (node.type === 'question') {
      controls.appendChild(button('⇄ Make action', 'ghost', () => {
        if ((node.yes || node.no) && !confirm('Turning this into an action deletes the Yes/No branches below it. Continue?')) return;
        node.type = 'action';
        delete node.yes;
        delete node.no;
        save();
        render();
      }, 'Convert to an action box'));
    } else {
      if (!node.next) {
        controls.appendChild(button('↓ Next step', null, () => {
          node.next = { id: uid(), type: 'action', text: '' };
          save();
          render();
        }, 'Add a box that follows this one, with a plain arrow (no Yes/No)'));
      }
      controls.appendChild(button('⇄ Make question', 'ghost', () => {
        if (node.next && !confirm('The steps below this box will be moved under its Yes branch. Continue?')) return;
        node.type = 'question';
        node.yes = node.next || null;
        node.no = null;
        delete node.next;
        save();
        render();
      }, 'Convert to a yes/no question'));
    }
    box.appendChild(controls);
  }
  return box;
}

function renderEmptySlot(parent, slot) {
  const box = el('div', 'node empty');
  if (!isAdmin) {
    box.appendChild(el('div', 'node-text muted', 'Not filled in yet'));
    return box;
  }
  box.appendChild(el('div', 'node-text muted', 'Empty branch'));
  const controls = el('div', 'node-controls');
  controls.appendChild(button('+ Question', null, () => {
    parent[slot] = { id: uid(), type: 'question', text: '', yes: null, no: null };
    save();
    render();
  }));
  controls.appendChild(button('+ Action', null, () => {
    parent[slot] = { id: uid(), type: 'action', text: '' };
    save();
    render();
  }));
  box.appendChild(controls);
  return box;
}
