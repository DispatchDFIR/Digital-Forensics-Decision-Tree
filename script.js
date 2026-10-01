// Digital Forensics Decision Tree — editable mindmap
// Data model: node = { id, type: 'question'|'action', text, yes: node|null, no: node|null }
// 'question' nodes always have two slots (yes/no) which may be empty (null) until filled.
// 'action' nodes are terminal leaves (no yes/no slots).

const STORAGE_KEY = 'df_tree_v1';
let treeData = null;
let saveTimer = null;

function uid() {
  return 'n' + Math.random().toString(36).slice(2, 10);
}

function exampleTree() {
  return {
    id: uid(),
    type: 'question',
    text: 'Is the device currently powered ON?',
    yes: {
      id: uid(),
      type: 'question',
      text: 'Is the screen locked?',
      yes: {
        id: uid(),
        type: 'action',
        text: 'Do NOT attempt to unlock it. Isolate from network (Faraday bag/airplane mode), note the lock type, and consult the examiner about bypass options (e.g. GrayKey, Cellebrite) before any interaction.'
      },
      no: {
        id: uid(),
        type: 'action',
        text: 'Keep it powered on and isolate from the network to prevent remote wipe. Photograph the screen, then capture volatile data (RAM, running processes, network connections) if authorized, before considering shutdown.'
      }
    },
    no: {
      id: uid(),
      type: 'question',
      text: 'Is it a mobile phone / tablet?',
      yes: {
        id: uid(),
        type: 'action',
        text: 'Do NOT power it on. Record make/model/IMEI, place in a Faraday bag, note visible battery level, and proceed to forensic extraction (logical/physical/JTAG/chip-off) per your lab SOP.'
      },
      no: {
        id: uid(),
        type: 'question',
        text: 'Will imaging be performed on-site?',
        yes: {
          id: uid(),
          type: 'action',
          text: 'Use a write-blocker, create a forensic image (e.g. dd / FTK Imager / Guymager), verify with a hash (SHA-256), and document chain of custody.'
        },
        no: {
          id: uid(),
          type: 'action',
          text: 'Package the media: label, anti-static bag, tamper-evident seal, complete the chain-of-custody form, and transport to the lab for controlled imaging.'
        }
      }
    }
  };
}

function blankTree() {
  return { id: uid(), type: 'question', text: '', yes: null, no: null };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      treeData = JSON.parse(raw);
      return;
    }
  } catch (e) {
    console.warn('Could not read saved tree, falling back to example.', e);
  }
  treeData = exampleTree();
}

function scheduleSave() {
  const indicator = document.getElementById('save-indicator');
  indicator.textContent = 'Saving…';
  indicator.classList.remove('flash');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(treeData));
      indicator.textContent = 'Saved';
      indicator.classList.add('flash');
    } catch (e) {
      indicator.textContent = 'Save failed';
    }
  }, 250);
}

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  return findNode(node.yes, id) || findNode(node.no, id);
}

function findParent(node, id, parent = null, slot = null) {
  if (!node) return null;
  if (node.id === id) return { parent, slot };
  return findParent(node.yes, id, node, 'yes') || findParent(node.no, id, node, 'no');
}

// ---------- Rendering ----------

function render() {
  const container = document.getElementById('tree-container');
  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;

  const root = document.getElementById('tree-root');
  root.innerHTML = '';
  const ul = document.createElement('ul');
  ul.appendChild(renderNodeLi(treeData, null, null, null));
  root.appendChild(ul);

  container.scrollLeft = scrollLeft;
  container.scrollTop = scrollTop;
}

function renderNodeLi(node, branchType, parent, slot) {
  const li = document.createElement('li');

  if (branchType) {
    const label = document.createElement('div');
    label.className = 'branch-label ' + branchType;
    label.textContent = branchType.toUpperCase();
    li.appendChild(label);
  }

  if (node) {
    li.appendChild(renderNodeBox(node, parent, slot));

    if (node.type === 'question') {
      const childrenUl = document.createElement('ul');
      childrenUl.className = 'branch-children';
      childrenUl.appendChild(renderNodeLi(node.yes, 'yes', node, 'yes'));
      childrenUl.appendChild(renderNodeLi(node.no, 'no', node, 'no'));
      li.appendChild(childrenUl);
    }
  } else {
    li.appendChild(renderPlaceholderBox(parent, slot));
  }

  return li;
}

function renderNodeBox(node, parent, slot) {
  const box = document.createElement('div');
  box.className = 'node ' + node.type;

  const labelRow = document.createElement('div');
  labelRow.className = 'label';
  const labelText = document.createElement('span');
  labelText.textContent = node.type === 'question' ? 'Question' : 'Action';
  labelRow.appendChild(labelText);

  if (parent) {
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete this box and everything below it';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      if (confirm('Delete this box and its entire sub-tree?')) {
        parent[slot] = null;
        scheduleSave();
        render();
      }
    });
    labelRow.appendChild(delBtn);
  }
  box.appendChild(labelRow);

  const text = document.createElement('div');
  text.className = 'text';
  text.contentEditable = 'true';
  text.setAttribute('data-placeholder', node.type === 'question' ? 'Type the yes/no question…' : 'Type the action to take…');
  text.textContent = node.text || '';
  text.addEventListener('blur', () => {
    node.text = text.textContent.trim();
    scheduleSave();
  });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      text.blur();
    }
  });
  box.appendChild(text);

  const controls = document.createElement('div');
  controls.className = 'node-controls';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'ghost';
  if (node.type === 'question') {
    toggleBtn.textContent = '⇄ Make final action';
    toggleBtn.title = 'Convert to a terminal action box (drops any yes/no branches below)';
    toggleBtn.addEventListener('click', () => {
      if (node.yes || node.no) {
        if (!confirm('This question has branches below it. Converting to an action will delete them. Continue?')) return;
      }
      node.type = 'action';
      delete node.yes;
      delete node.no;
      scheduleSave();
      render();
    });
  } else {
    toggleBtn.textContent = '⇄ Make question';
    toggleBtn.title = 'Convert to a yes/no question with two new branches';
    toggleBtn.addEventListener('click', () => {
      node.type = 'question';
      node.yes = null;
      node.no = null;
      scheduleSave();
      render();
    });
  }
  controls.appendChild(toggleBtn);
  box.appendChild(controls);

  return box;
}

function renderPlaceholderBox(parent, slot) {
  const box = document.createElement('div');
  box.className = 'node placeholder';
  box.style.border = '1px dashed var(--border)';
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.gap = '6px';
  box.style.alignItems = 'center';

  const hint = document.createElement('div');
  hint.className = 'text';
  hint.style.color = 'var(--muted)';
  hint.style.fontSize = '12px';
  hint.textContent = 'Empty — add a box';
  box.appendChild(hint);

  const row = document.createElement('div');
  row.className = 'node-controls';

  const addQ = document.createElement('button');
  addQ.textContent = '+ Question';
  addQ.addEventListener('click', () => {
    parent[slot] = { id: uid(), type: 'question', text: '', yes: null, no: null };
    scheduleSave();
    render();
  });

  const addA = document.createElement('button');
  addA.textContent = '+ Action';
  addA.addEventListener('click', () => {
    parent[slot] = { id: uid(), type: 'action', text: '' };
    scheduleSave();
    render();
  });

  row.appendChild(addQ);
  row.appendChild(addA);
  box.appendChild(row);

  return box;
}

// ---------- Toolbar ----------

document.getElementById('btn-add-root').addEventListener('click', () => {
  if (!confirm('Start a brand new, empty tree? This replaces the current one (export first if you want to keep it).')) return;
  treeData = blankTree();
  scheduleSave();
  render();
});

document.getElementById('btn-example').addEventListener('click', () => {
  if (!confirm('Load the example digital forensics triage tree? This replaces the current one (export first if you want to keep it).')) return;
  treeData = exampleTree();
  scheduleSave();
  render();
});

document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(treeData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      treeData = parsed;
      scheduleSave();
      render();
    } catch (err) {
      alert('That file is not valid JSON for this tree.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-print').addEventListener('click', () => {
  window.print();
});

// ---------- Init ----------

async function init() {
  // If no local edits are saved yet, try to load a committed data.json (so
  // GitHub Pages visitors see the maintainer's tree, not just the built-in example).
  const hasLocalSave = !!localStorage.getItem(STORAGE_KEY);
  if (!hasLocalSave) {
    try {
      const res = await fetch('data.json', { cache: 'no-store' });
      if (res.ok) {
        treeData = await res.json();
        render();
        return;
      }
    } catch (e) {
      // no data.json present (e.g. local file:// usage) — fall through to defaults
    }
  }
  load();
  render();
}

init();
