import { el } from './shared.js?v=4';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEM = 22;          // parent box bottom → horizontal rail
const GAP_X = 28;         // space between neighbouring branches
const DROP_LABEL = 78;    // rail → child box when the arrow carries a label
const DROP_PLAIN = 48;    // rail → child box for a plain arrow
const CORNER = 8;
const PAD_X = 600;
const PAD_TOP = 40;
const PAD_BOTTOM = 420;
const DRAG_THRESHOLD = 4;

// Lays a tree out with absolutely positioned boxes and SVG arrows, and lets boxes be dragged.
//   childrenOf(node) -> [{ node|null, kind: 'yes'|'no'|'next'|'custom', label: Element|null, ...extra }]
//   renderBox(spec)  -> box Element (spec is the root spec { node, kind: null } or a child spec)
//   canDrag()        -> whether boxes may be moved right now
//   onMove(nodes, dx, dy) -> persist a move; nodes are the moved data nodes
// Moved boxes keep an offset from their automatic position in node.pos = { x, y }.
export function createDiagram({ canvas, stage, zoom, childrenOf, renderBox, canDrag, onMove }) {
  let items = [];
  let root = null;
  let origin = null;
  let stale = false;
  let svg = null;
  let contentBox = null;
  let drag = null;
  const idPrefix = `${stage.id}-arrow`;
  const resizeObserver = new ResizeObserver(() => { if (root && !drag) relayout(); });

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);

  function clear(message) {
    resizeObserver.disconnect();
    items = [];
    root = null;
    stage.innerHTML = '';
    stage.style.width = '';
    stage.style.height = '';
    if (message) stage.appendChild(el('p', 'loading', message));
  }

  function render(rootNode) {
    const scroll = { left: canvas.scrollLeft, top: canvas.scrollTop };
    clear();
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('links');
    svg.appendChild(markers());
    stage.appendChild(svg);
    contentBox = el('div', 'content-box');
    stage.appendChild(contentBox);

    root = build({ node: rootNode, kind: null, label: null }, null);
    for (const item of items) resizeObserver.observe(item.el);
    relayout(scroll);
  }

  function build(spec, parent) {
    const item = { ...spec, parent, children: [] };
    item.el = renderBox(spec);
    item.el.classList.add('placed');
    if (spec.node) item.el.classList.add('movable');
    stage.appendChild(item.el);
    if (spec.label) {
      spec.label.classList.add('placed-label');
      stage.appendChild(spec.label);
    }
    items.push(item);
    if (spec.node) {
      for (const child of childrenOf(spec.node)) item.children.push(build(child, item));
    }
    return item;
  }

  function relayout(scroll = { left: canvas.scrollLeft, top: canvas.scrollTop }) {
    if (!root) return;
    if (!canvas.clientWidth) { stale = true; return; }
    stale = false;
    const scale = zoom.getScale();
    for (const item of items) {
      const r = item.el.getBoundingClientRect();
      item.w = r.width / scale;
      item.h = r.height / scale;
    }
    measureSubtree(root);
    placeSubtree(root, 0, 0);
    for (const item of items) {
      const pos = item.node && item.node.pos;
      item.x = item.ax + (pos ? pos.x || 0 : 0);
      item.y = item.ay + (pos ? pos.y || 0 : 0);
    }
    applyPositions(scroll, scale);
  }

  function measureSubtree(item) {
    const kids = item.children;
    if (!kids.length) { item.sw = item.w; return; }
    kids.forEach(measureSubtree);
    item.span = kids.reduce((sum, k) => sum + k.sw, 0) + GAP_X * (kids.length - 1);
    item.sw = Math.max(item.w, item.span);
  }

  function placeSubtree(item, left, top) {
    item.ay = top;
    const kids = item.children;
    if (!kids.length) {
      item.ax = left + (item.sw - item.w) / 2;
      return;
    }
    const drop = kids.some((k) => k.label) ? DROP_LABEL : DROP_PLAIN;
    const childTop = top + item.h + STEM + drop;
    let x = left + (item.sw - item.span) / 2;
    for (const k of kids) {
      placeSubtree(k, x, childTop);
      x += k.sw + GAP_X;
    }
    // Centre the parent over its own arrows, not over the full width of everything below it.
    const first = kids[0];
    const last = kids[kids.length - 1];
    item.ax = (first.ax + first.w / 2 + last.ax + last.w / 2) / 2 - item.w / 2;
  }

  function applyPositions(scroll, scale) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of items) {
      minX = Math.min(minX, i.x);
      minY = Math.min(minY, i.y);
      maxX = Math.max(maxX, i.x + i.w);
      maxY = Math.max(maxY, i.y + i.h);
    }
    const next = { ox: PAD_X - minX, oy: PAD_TOP - minY };
    stage.style.width = `${maxX - minX + PAD_X * 2}px`;
    stage.style.height = `${maxY - minY + PAD_TOP + PAD_BOTTOM}px`;
    Object.assign(contentBox.style, {
      left: `${PAD_X}px`, top: `${PAD_TOP}px`,
      width: `${maxX - minX}px`, height: `${maxY - minY}px`
    });

    // Keep what's on screen still when the drawing's bounds grow or shrink.
    const shift = origin ? { x: next.ox - origin.ox, y: next.oy - origin.oy } : { x: 0, y: 0 };
    origin = next;
    for (const i of items) setPos(i);
    draw();
    canvas.scrollLeft = scroll.left + shift.x * scale;
    canvas.scrollTop = scroll.top + shift.y * scale;
  }

  function setPos(item) {
    item.el.style.left = `${item.x + origin.ox}px`;
    item.el.style.top = `${item.y + origin.oy}px`;
  }

  function draw() {
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild);
    svg.setAttribute('width', stage.style.width);
    svg.setAttribute('height', stage.style.height);
    for (const item of items) {
      if (!item.children.length) continue;
      const px = item.x + origin.ox + item.w / 2;
      const pb = item.y + origin.oy + item.h;
      const rail = pb + STEM;
      line(`M${px},${pb} V${rail}`, 'stem');
      for (const k of item.children) {
        const cx = k.x + origin.ox + k.w / 2;
        const ct = k.y + origin.oy;
        const variant = k.kind === 'yes' || k.kind === 'no' ? k.kind : 'plain';
        line(elbow(px, rail, cx, ct - 1), `link ${variant}`, `url(#${idPrefix}-${variant})`);
        if (k.label) {
          k.label.style.left = `${cx}px`;
          k.label.style.top = `${(rail + ct) / 2}px`;
        }
      }
    }
  }

  function elbow(x1, y1, x2, y2) {
    const dx = x2 - x1;
    if (Math.abs(dx) < 1) return `M${x1},${y1} V${y2}`;
    const r = Math.min(CORNER, Math.abs(dx), Math.abs(y2 - y1) / 2);
    const dir = Math.sign(dx);
    const down = Math.sign(y2 - y1) || 1;
    return `M${x1},${y1} H${x2 - dir * r} Q${x2},${y1} ${x2},${y1 + down * r} V${y2}`;
  }

  function line(d, className, marker) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', className);
    if (marker) p.setAttribute('marker-end', marker);
    svg.appendChild(p);
  }

  function markers() {
    const defs = document.createElementNS(SVG_NS, 'defs');
    for (const variant of ['plain', 'yes', 'no']) {
      const m = document.createElementNS(SVG_NS, 'marker');
      m.setAttribute('id', `${idPrefix}-${variant}`);
      m.setAttribute('viewBox', '0 0 10 10');
      m.setAttribute('refX', '9');
      m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '6');
      m.setAttribute('markerHeight', '6');
      m.setAttribute('markerUnits', 'strokeWidth');
      m.setAttribute('orient', 'auto');
      const head = document.createElementNS(SVG_NS, 'path');
      head.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      head.setAttribute('class', `arrowhead ${variant}`);
      m.appendChild(head);
      defs.appendChild(m);
    }
    return defs;
  }

  function subtree(item, out = []) {
    out.push(item);
    item.children.forEach((k) => subtree(k, out));
    return out;
  }

  function onPointerDown(e) {
    if (drag || !canDrag()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const box = e.target.closest('.node');
    if (!box || e.target.closest('button, input, [contenteditable="true"]')) return;
    const item = items.find((i) => i.el === box);
    if (!item || !item.node) return;
    const moving = (e.shiftKey ? subtree(item) : [item]).filter((i) => i.node);
    drag = {
      id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, box,
      moving: moving.map((i) => ({ item: i, x: i.x, y: i.y }))
    };
    box.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const cdx = e.clientX - drag.x;
    const cdy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(cdx, cdy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      for (const m of drag.moving) m.item.el.classList.add('dragging');
    }
    const scale = zoom.getScale();
    for (const m of drag.moving) {
      m.item.x = m.x + cdx / scale;
      m.item.y = m.y + cdy / scale;
      setPos(m.item);
    }
    draw();
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.box.hasPointerCapture(e.pointerId)) d.box.releasePointerCapture(e.pointerId);
    if (!d.moved) return;
    for (const m of d.moving) m.item.el.classList.remove('dragging');
    const scale = zoom.getScale();
    const dx = Math.round((e.clientX - d.x) / scale);
    const dy = Math.round((e.clientY - d.y) / scale);
    const rootBefore = root;
    onMove(d.moving.map((m) => m.item.node), dx, dy);
    if (root === rootBefore) relayout();
  }

  // Scroll so the top box is centred horizontally. Returns false if the canvas is hidden.
  function centre() {
    if (!root || stale || !canvas.clientWidth) return false;
    const scale = zoom.getScale();
    canvas.scrollLeft = (root.x + origin.ox + root.w / 2) * scale - canvas.clientWidth / 2;
    canvas.scrollTop = 0;
    return true;
  }

  return {
    render,
    clear,
    centre,
    refresh: () => { if (root && (stale || !origin)) relayout(); },
    isDragging: () => !!drag
  };
}

export function clearPositions(node, childrenOf) {
  if (!node) return;
  delete node.pos;
  for (const c of childrenOf(node)) clearPositions(c.node, childrenOf);
}

export function nudge(node, dx, dy) {
  const x = ((node.pos && node.pos.x) || 0) + dx;
  const y = ((node.pos && node.pos.y) || 0) + dy;
  if (x === 0 && y === 0) delete node.pos;
  else node.pos = { x, y };
}
