export function uid() {
  return 'n' + Math.random().toString(36).slice(2, 10);
}

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function button(label, className, onClick, title) {
  const b = el('button', className, label);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

// Inline-editable text. Commits on blur; Enter commits, Shift+Enter inserts a newline.
export function editableText(className, value, placeholder, editable, onCommit) {
  const t = el('div', className);
  t.textContent = value || '';
  t.dataset.placeholder = placeholder;
  if (editable) {
    t.contentEditable = 'true';
    t.addEventListener('blur', () => {
      const next = t.innerText.trim();
      if (next !== (value || '')) onCommit(next);
    });
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        t.blur();
      }
    });
  }
  return t;
}

export function isEditingInside(container) {
  const a = document.activeElement;
  return !!a && a.isContentEditable && container.contains(a);
}

export function setStatus(text, ok) {
  const s = document.getElementById('save-indicator');
  if (!s) return;
  s.textContent = text;
  s.classList.toggle('ok', !!ok);
}

// Arrow from the branch rail down to a child box, with an optional label sitting on the line.
export function connector(variant, label) {
  const c = el('div', `connector ${variant || ''}`);
  c.appendChild(el('span', 'seg'));
  if (label) c.appendChild(label);
  c.appendChild(el('span', 'seg'));
  c.appendChild(el('span', 'arrow'));
  return c;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

// Drag empty space to pan; Ctrl/Cmd + wheel, trackpad pinch, or two-finger pinch to zoom.
// `stage` is the element that gets scaled; `controls` holds the zoom buttons.
export function enableCanvas(canvas, stage, controls) {
  let scale = 1;
  const label = controls.querySelector('.zoom-level');
  const pointers = new Map();
  let pan = null;
  let pinch = null;

  function setScale(next, clientX, clientY) {
    next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const rect = canvas.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const contentX = (canvas.scrollLeft + px) / scale;
    const contentY = (canvas.scrollTop + py) / scale;
    scale = next;
    stage.style.zoom = String(scale);
    canvas.scrollLeft = contentX * scale - px;
    canvas.scrollTop = contentY * scale - py;
    label.textContent = `${Math.round(scale * 100)}%`;
  }

  function fit() {
    const content = stage.querySelector('ul.root');
    if (!content) return;
    const c = canvas.getBoundingClientRect();
    const r = content.getBoundingClientRect();
    const natW = r.width / scale;
    const natH = r.height / scale;
    setScale(Math.min((c.width - 40) / natW, (c.height - 40) / natH, 1));
    const r2 = content.getBoundingClientRect();
    canvas.scrollLeft += (r2.left - c.left) - (c.width - r2.width) / 2;
    canvas.scrollTop += (r2.top - c.top) - Math.max(20, (c.height - r2.height) / 2);
  }

  controls.querySelector('.zoom-in').addEventListener('click', () => setScale(scale * 1.2));
  controls.querySelector('.zoom-out').addEventListener('click', () => setScale(scale / 1.2));
  controls.querySelector('.zoom-fit').addEventListener('click', fit);
  label.addEventListener('click', () => setScale(1));

  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setScale(scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });

  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const midpoint = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const startPan = (p) => {
    pan = { x: p.x, y: p.y, left: canvas.scrollLeft, top: canvas.scrollTop };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // A first touch on a box or control is a normal click/edit, not a drag.
    if (pointers.size === 0 && e.target.closest('.node, .edge-label, button, input, select, textarea, [contenteditable="true"]')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      startPan({ x: e.clientX, y: e.clientY });
      canvas.classList.add('panning');
    } else if (pointers.size === 2) {
      pan = null;
      pinch = { dist: distance(), scale };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const mid = midpoint();
      setScale(pinch.scale * (distance() / pinch.dist), mid.x, mid.y);
    } else if (pan) {
      canvas.scrollLeft = pan.left - (e.clientX - pan.x);
      canvas.scrollTop = pan.top - (e.clientY - pan.y);
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    canvas.releasePointerCapture(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      startPan([...pointers.values()][0]);
    } else if (pointers.size === 0) {
      pan = null;
      canvas.classList.remove('panning');
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return { fit, reset: () => setScale(1) };
}

// Centre the root box horizontally the first time a tree is shown.
export function centreOnRoot(container) {
  const root = container.querySelector('.node');
  if (!root) return;
  const c = container.getBoundingClientRect();
  const r = root.getBoundingClientRect();
  container.scrollLeft += (r.left + r.width / 2) - (c.left + c.width / 2);
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
