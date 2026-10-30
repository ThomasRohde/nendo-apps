// The World tab: a canvas the World morph draws on. Each event the canvas takes becomes a
// UIEvent, which the World handles in a process of its own (WorldMorph>>handle:on:), one event
// at a time and in order. When the World drew, the Canvas's operations are painted at once, so
// a frame never shows half drawn. A run that stops for the debugger halts the World until it
// ends; the events that come meanwhile are dropped.
import { STObject } from './vm/vm.mjs';

const STEP_MS = 250;
const SLIP_KEYS = new Set(['d', 'p', 'i', '.', 's', 'b', 'r', 'l', 'w', 't', 'n', 'f']);
// The theme colours a morph asks for by name (Color background, Color text ...): Nendo's tokens.
const TOKENS = { background: '--canvas', panel: '--surface-soft', surface: '--surface-raised', text: '--ink', mutedText: '--muted', accent: '--cobalt', line: '--line-strong' };

/** A Point for the VM. */
export function point(vm, x, y) {
  const p = new STObject(vm.classes.Point, 2);
  p.f = [Math.round(x), Math.round(y)];
  return p;
}

/** A UIEvent for the VM: type is #mouseDown, #mouseMove, #mouseUp, #wheel, #keyDown, #step, #resize or #redraw. */
export function uiEvent(vm, type, x = 0, y = 0, { button = 0, key = null, shift = false, ctrl = false, clicks = 1, delta = 0 } = {}) {
  const event = new STObject(vm.classes.UIEvent, 8);
  event.f = [vm.symbol(type), point(vm, x, y), button, key === null ? null : vm.str(key), shift, ctrl, clicks, Math.round(delta)];
  return event;
}

/** A Canvas with no operations yet; they collect in canvas.ops. */
export function newCanvas(vm) {
  const canvas = new STObject(vm.classes.Canvas, 0);
  canvas.ops = [];
  return canvas;
}

/** Paints a Canvas's operations on a 2D context, the page's font named. */
export function paint(g, ops, { width, height, ratio = 1, font = 'sans-serif' }) {
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);
  let clips = 0;
  for (const op of ops) {
    switch (op[0]) {
      case 'fill': g.fillStyle = op[5]; g.fillRect(op[1], op[2], op[3], op[4]); break;
      case 'frame': {
        const w = op[6];
        if (w <= 0) break;
        g.strokeStyle = op[5]; g.lineWidth = w;
        g.strokeRect(op[1] + w / 2, op[2] + w / 2, op[3] - w, op[4] - w);
        break;
      }
      case 'round':
        g.fillStyle = op[6]; g.beginPath();
        if (g.roundRect) g.roundRect(op[1], op[2], op[3], op[4], op[5]); else g.rect(op[1], op[2], op[3], op[4]);
        g.fill();
        break;
      case 'oval':
        g.fillStyle = op[5]; g.beginPath();
        g.ellipse(op[1] + op[3] / 2, op[2] + op[4] / 2, Math.abs(op[3] / 2), Math.abs(op[4] / 2), 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'line':
        if (op[6] <= 0) break;
        g.strokeStyle = op[5]; g.lineWidth = op[6]; g.beginPath();
        g.moveTo(op[1], op[2]); g.lineTo(op[3], op[4]); g.stroke();
        break;
      case 'text':
        g.fillStyle = op[6]; g.textBaseline = 'top';
        g.font = `${op[5] ? '600 ' : ''}${op[4]}px ${font}`;
        g.fillText(op[1], op[2], op[3]);
        break;
      case 'clip': g.save(); clips++; g.beginPath(); g.rect(op[1], op[2], op[3], op[4]); g.clip(); break;
      case 'unclip': if (clips > 0) { g.restore(); clips--; } break;
    }
  }
  while (clips-- > 0) g.restore();
}

/**
 * env: { image(), canvas (the element), show() (shows the World tab), visible(), dark(),
 * stopped(proc) (shows the notifier for a World run that stopped), problem(error) }.
 * Answers the display: vm.hooks.display is set to its hook, and the view hands it the page's
 * events through its own listeners.
 */
export function createDisplay(env) {
  const { canvas } = env;
  const queue = [];
  let world = null;
  let busy = false;
  let halted = false;
  let painted = [];     // the last frame's operations
  let frames = 0;
  let measure = null;
  let probe = null;
  const font = () => getComputedStyle(canvas).fontFamily || 'sans-serif';
  const size = () => [canvas.clientWidth, canvas.clientHeight];

  const hook = {
    open(morph) {
      world = morph;
      env.show();
      refresh();
    },
    size,
    dark: () => env.dark(),
    color(name) {
      const token = TOKENS[name];
      if (!token) return null;
      probe ??= Object.assign(document.createElement('span'), { hidden: true });
      if (!probe.isConnected) canvas.after(probe);
      probe.style.color = `var(${token})`;
      const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(v => Math.round(Number(v)));
      return rgb?.length === 3 ? rgb : null;
    },
    measure(text, px, bold) {
      measure ??= document.createElement('canvas').getContext('2d');
      measure.font = `${bold ? '600 ' : ''}${px}px ${font()}`;
      return measure.measureText(text).width;
    },
  };

  /** Queues an event; a move replaces a move that still waits. Runs later, never inside a process. */
  function post(type, x, y, options) {
    if (!world || halted) return;
    const last = queue[queue.length - 1];
    if (type === 'mouseMove' && last?.type === 'mouseMove') queue.pop();
    queue.push({ type, x, y, options });
    Promise.resolve().then(pump);
  }

  async function pump() {
    if (busy || halted) return;
    busy = true;
    try {
      while (queue.length && !halted) {
        const { type, x, y, options } = queue.shift();
        const image = env.image(), vm = image.vm;
        const target = newCanvas(vm);
        const outcome = await image.send(world, 'handle:on:', [uiEvent(vm, type, x, y, options), target]);
        ended(outcome, target);
      }
    } finally { busy = false; }
  }

  /** How a World run ended: painted, stopped for the debugger, or failed. */
  function ended(outcome, target) {
    if (outcome.suspended) { halted = true; queue.length = 0; env.stopped(outcome.suspended); return; }
    if (outcome.error) { env.problem(outcome.error); return; }
    if (outcome.value === true) draw(target.ops);
  }

  function draw(ops) {
    painted = ops;
    frames++;
    const [width, height] = size();
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    paint(canvas.getContext('2d'), ops, { width, height, ratio, font: font() });
  }

  /** Draws the World again from scratch: its size may have changed, or the theme. */
  function refresh() {
    if (!world) return;
    const [width, height] = size();
    if (width > 0 && height > 0) post('resize', width, height);
    post('redraw', 0, 0);
  }

  /** A stopped World run ended in the debugger or the notifier: the World goes on. */
  function resume() {
    halted = false;
    refresh();
  }

  setInterval(() => { if (world && !halted && !busy && !queue.length && env.visible()) post('step', 0, 0); }, STEP_MS);

  // ---- The canvas's events
  let clicks = 0, last = { time: -1e9, x: 0, y: 0 };
  const at = event => { const box = canvas.getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };
  canvas.addEventListener('pointerdown', event => {
    canvas.focus();
    canvas.setPointerCapture?.(event.pointerId);
    // A pointer event carries no click count, so a second press near the first, soon, is a double click.
    const [x, y] = at(event), now = performance.now();
    clicks = now - last.time < 450 && Math.abs(x - last.x) < 5 && Math.abs(y - last.y) < 5 ? clicks + 1 : 1;
    last = { time: now, x, y };
    post('mouseDown', x, y, { button: event.button, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, clicks });
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const lines = event.deltaMode === 1 ? event.deltaY * 20 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
    post('wheel', ...at(event), { shift: event.shiftKey, delta: lines });
  }, { passive: false });
  canvas.addEventListener('pointermove', event => post('mouseMove', ...at(event), { button: event.button, shift: event.shiftKey }));
  canvas.addEventListener('pointerup', event => post('mouseUp', ...at(event), { button: event.button, shift: event.shiftKey }));
  canvas.addEventListener('keydown', event => {
    const ctrl = event.ctrlKey || event.metaKey;
    // Slip's own keys (Do it, Print it, Stop ...) and the browser's stay theirs.
    if (event.altKey || (ctrl && SLIP_KEYS.has(event.key.toLowerCase()))) return;
    if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key) || (event.key === 'Tab' && event.shiftKey)) return;
    event.preventDefault();
    post('keyDown', 0, 0, { key: event.key, shift: event.shiftKey, ctrl });
  });
  new ResizeObserver(() => refresh()).observe(canvas);

  return {
    hook, post, refresh, resume,
    get open() { return world !== null; },
    get halted() { return halted; },
    get ops() { return painted; },
    get frames() { return frames; },
    get busy() { return busy || queue.length > 0; },
  };
}
