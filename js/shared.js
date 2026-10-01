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

// Click-and-drag on empty canvas space to pan in any direction.
export function enablePan(container) {
  let start = null;
  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.node, button, input, select, textarea, [contenteditable="true"]')) return;
    start = { x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop, id: e.pointerId };
    container.setPointerCapture(e.pointerId);
    container.classList.add('panning');
  });
  container.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    container.scrollLeft = start.left - (e.clientX - start.x);
    container.scrollTop = start.top - (e.clientY - start.y);
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    container.releasePointerCapture(e.pointerId);
    container.classList.remove('panning');
    start = null;
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
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
