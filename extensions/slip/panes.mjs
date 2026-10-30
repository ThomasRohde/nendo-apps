// Slip's class browser and inspector, drawn from tools.mjs. The view hands each one what it
// needs: the image, its helpers, and how to evaluate in a text area.
import { ALL, SIDES, METHOD_TEMPLATE, packages, classesIn, protocols, selectors, methodOf, classDefinition, classTemplate,
  accept, setComment, classNamed, fields, moreIndexed, titleOf, printed } from './tools.mjs';

const $ = id => document.getElementById(id);

// ---- The class browser ---------------------------------------------------------------

/**
 * env: { image(), h, say, remember, recall, kept() }. The browser shows one thing in its code
 * pane at a time: a method, a class definition, a class comment, or a template for a new one.
 */
export function createBrowser(env) {
  const saved = env.recall('slip.browser') ?? {};
  const state = { pkg: saved.pkg ?? null, cls: saved.cls ?? null, side: saved.side === SIDES.class ? SIDES.class : SIDES.instance,
    protocol: saved.protocol ?? ALL, selector: saved.selector ?? null, mode: 'definition', shown: null };
  let discardArmed = false, removeArmed = false;
  const code = $('b-code');
  const vm = () => env.image().vm;
  const current = () => state.cls ? classNamed(vm(), state.cls) : null;
  const dirty = () => state.shown !== null && code.value !== state.shown;
  const keep = () => env.remember('slip.browser', { pkg: state.pkg, cls: state.cls, side: state.side, protocol: state.protocol, selector: state.selector });

  // A change of selection drops an edit not yet accepted only on a second try.
  function leave() {
    if (!dirty() || discardArmed) { discardArmed = false; return true; }
    discardArmed = true;
    env.say('The code has a change you have not accepted. Accept it (Ctrl+S), or choose again to drop it.');
    setTimeout(() => { discardArmed = false; }, 4000);
    return false;
  }

  function choose(change) {
    if (!leave()) return;
    Object.assign(state, change);
    problem(null);
    removeArmed = false;
    keep();
    render(true);
  }

  function list(id, items, selected, pick) {
    $(id).replaceChildren(...items.map(item => {
      const value = typeof item === 'string' ? item : item.value;
      const li = env.h('li', { role: 'option', 'aria-selected': value === selected ? 'true' : 'false', class: item.extended ? 'extended' : null,
        'data-value': value, title: item.title ?? value }, item.label ?? value);
      li.addEventListener('click', () => pick(value));
      return li;
    }));
    $(id).querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }

  // What the code pane holds for the current selection, and how it reads.
  function content() {
    const cls = current();
    if (state.mode === 'new-class') return { text: classTemplate(state.pkg), what: `A new class in ${state.pkg ?? 'Unpackaged'}` };
    if (!cls) return { text: '', what: state.pkg ? 'Choose a class, or make a new one.' : 'Choose a package.' };
    const side = state.side === SIDES.class ? ' class' : '';
    if (state.mode === 'comment') return { text: cls.comment ?? '', what: `The comment of ${cls.name}` };
    if (state.mode === 'new-method') return { text: METHOD_TEMPLATE, what: `A new method in ${cls.name}${side}, ${state.protocol === ALL ? 'as yet unclassified' : state.protocol}` };
    const method = state.selector ? methodOf(cls, state.side, state.selector) : null;
    if (method) return { text: method.source, what: `${cls.name}${side}>>${method.selector} · ${method.protocol || 'as yet unclassified'}` };
    return { text: classDefinition(vm(), cls), what: `The definition of ${cls.name}${cls.comment ? '' : ' · it has no comment yet'}` };
  }

  function render(fresh = false) {
    if (!env.image()) return;
    const v = vm();
    const pkgs = packages(v);
    if (!state.pkg || !pkgs.includes(state.pkg)) state.pkg = pkgs.includes('Examples') ? 'Examples' : pkgs[0] ?? null;
    list('b-packages', pkgs, state.pkg, pkg => choose({ pkg, cls: null, selector: null, protocol: ALL, mode: 'definition' }));
    const shown = state.pkg ? classesIn(v, state.pkg) : [];
    if (state.cls && !shown.some(c => c.cls.name === state.cls) && state.mode !== 'new-class') { state.cls = null; state.selector = null; }
    list('b-classes', shown.map(({ cls, extended }) => ({ value: cls.name, extended, title: extended ? `${cls.name}, extended by ${state.pkg}` : cls.name })), state.cls,
      name => choose({ cls: name, selector: null, protocol: ALL, mode: 'definition' }));
    const cls = current();
    const protos = cls ? protocols(cls, state.side) : [];
    if (!protos.includes(state.protocol)) state.protocol = ALL;
    list('b-protocols', protos, cls ? state.protocol : null, protocol => choose({ protocol, selector: null, mode: 'definition' }));
    const sels = cls ? selectors(cls, state.side, state.protocol) : [];
    if (state.selector && !sels.includes(state.selector) && state.mode === 'method') { state.selector = null; state.mode = 'definition'; }
    list('b-methods', sels, state.selector, selector => choose({ selector, mode: 'method' }));
    $('b-instance').setAttribute('aria-pressed', String(state.side === SIDES.instance));
    $('b-class').setAttribute('aria-pressed', String(state.side === SIDES.class));
    $('b-comment').setAttribute('aria-pressed', String(state.mode === 'comment'));
    $('b-comment').disabled = !cls;
    $('b-new-method').disabled = !cls;
    $('b-remove').disabled = !(cls && state.mode === 'method' && state.selector);
    $('b-remove').textContent = removeArmed ? 'Remove it?' : 'Remove method';
    const { text, what } = content();
    $('b-what').textContent = what;
    // An edit in progress stays, unless the person chose something else.
    if (fresh || !dirty()) { code.value = text; state.shown = text; }
    code.dataset.dirty = String(dirty());
    $('b-accept').disabled = !cls && state.mode !== 'new-class';
  }

  function problem(text, at) {
    $('b-problem').hidden = !text;
    $('b-problem').textContent = text ?? '';
    if (text && at !== undefined) { code.focus(); code.setSelectionRange(at, at); }
  }

  /** Compiles or defines what the code pane holds. */
  function acceptCode() {
    const v = vm();
    const cls = current();
    const text = code.value;
    try {
      if (state.mode === 'comment' && cls) {
        setComment(v, cls, text);
        state.shown = text;
        env.say(`The comment of ${cls.name} is kept.`);
      } else if (state.mode === 'method' || state.mode === 'new-method') {
        if (!cls) return;
        const old = state.selector ? methodOf(cls, state.side, state.selector) : null;
        const protocol = state.mode === 'method' && old ? old.protocol : state.protocol === ALL ? 'as yet unclassified' : state.protocol;
        const method = accept(v, cls, state.side, text, protocol);
        Object.assign(state, { selector: method.selector, mode: 'method', protocol: state.protocol === ALL ? ALL : method.protocol || state.protocol });
        state.shown = null;
        env.say(`${cls.name}${state.side === SIDES.class ? ' class' : ''}>>${method.selector} is compiled.`);
      } else {
        const { value, error } = env.image().evaluateSync(text);
        if (error) { problem(error.message, error.position); return; }
        const defined = classNamed(v, value?.name);
        if (!defined) { problem('A class definition must answer a class. This evaluated, but defined none.'); return; }
        Object.assign(state, { pkg: defined.package || 'Unpackaged', cls: defined.name, selector: null, protocol: ALL, mode: 'definition' });
        state.shown = null;
        env.say(`${defined.name} is defined.`);
      }
      problem(null);
      keep();
      render(true);
      env.changed();
    } catch (error) {
      problem(error.message, error.position);
    }
  }

  function remove() {
    const cls = current();
    if (!cls || !state.selector) return;
    if (!removeArmed) { removeArmed = true; render(); setTimeout(() => { removeArmed = false; render(); }, 3000); return; }
    removeArmed = false;
    vm().removeMethod(state.side === SIDES.class ? cls.cls : cls, state.selector);
    env.say(`${cls.name}>>${state.selector} is removed.`);
    state.selector = null;
    state.mode = 'definition';
    keep();
    render(true);
    env.changed();
  }

  /** Shows a class, and a method of it when one is named. */
  function browse(cls, selector = null, side = SIDES.instance) {
    choose({ pkg: cls.package || 'Unpackaged', cls: cls.name, side, protocol: ALL, selector, mode: selector ? 'method' : 'definition' });
  }

  $('b-instance').addEventListener('click', () => choose({ side: SIDES.instance, selector: null, protocol: ALL, mode: 'definition' }));
  $('b-class').addEventListener('click', () => choose({ side: SIDES.class, selector: null, protocol: ALL, mode: 'definition' }));
  $('b-comment').addEventListener('click', () => choose({ mode: state.mode === 'comment' ? 'definition' : 'comment', selector: null }));
  $('b-new-method').addEventListener('click', () => { choose({ mode: 'new-method', selector: null }); if (state.mode === 'new-method') { code.focus(); code.setSelectionRange(0, 'messageSelectorAndArgumentNames'.length); } });
  $('b-new-class').addEventListener('click', () => { choose({ mode: 'new-class', cls: null, selector: null }); if (state.mode === 'new-class') code.focus(); });
  $('b-remove').addEventListener('click', remove);
  $('b-accept').addEventListener('click', acceptCode);
  code.addEventListener('input', () => { code.dataset.dirty = String(dirty()); });
  code.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    code.setRangeText('\t', code.selectionStart, code.selectionEnd, 'end');
    code.dataset.dirty = String(dirty());
  });
  // Up and Down move through a list, as in any list box.
  for (const id of ['b-packages', 'b-classes', 'b-protocols', 'b-methods']) $(id).addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...$(id).children];
    const at = items.findIndex(li => li.getAttribute('aria-selected') === 'true');
    items[Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]?.click();
    $(id).focus();
  });

  return { render, acceptCode, browse, state, dirty };
}

// ---- The inspector -------------------------------------------------------------------

/** env: { image(), h, say, open(on) }. A stack of objects: a field opens the next. */
export function createInspector(env) {
  let stack = [];
  const top = () => stack.at(-1) ?? null;

  function inspect(value, label = null) {
    stack = [{ value, label }];
    open();
  }

  function open() {
    env.open(stack.length > 0);
    render();
    $('i-result').hidden = true;
  }

  function render() {
    if (!stack.length) return;
    const image = env.image();
    const { value } = top();
    const { className, printed: text } = titleOf(image, value);
    $('i-class').textContent = className;
    $('i-print').textContent = text;
    $('i-print').title = text;
    $('i-back').disabled = stack.length < 2;
    $('i-path').textContent = stack.length > 1 ? stack.map((entry, i) => i === 0 ? 'self' : entry.label).join(' › ') : '';
    const rows = fields(image.vm, value);
    $('i-fields').replaceChildren(...(rows.length ? rows.map(row => env.h('li', {},
      env.h('button', { type: 'button', class: row.kind, 'data-label': row.label, title: `Inspect ${row.label}`, onclick: () => { stack.push({ value: row.value, label: row.label }); open(); } },
        env.h('span', { class: 'label' }, row.label), env.h('span', { class: 'value' }, printed(image, row.value)))))
      : [env.h('li', { class: 'i-more' }, 'It has no fields: it is its value.')]));
    const more = moreIndexed(image.vm, value);
    $('i-more').hidden = more === 0;
    $('i-more').textContent = more ? `And ${more} more indexed slots.` : '';
  }

  $('i-back').addEventListener('click', () => { if (stack.length > 1) { stack.pop(); open(); } });
  $('i-refresh').addEventListener('click', render);
  $('i-close').addEventListener('click', () => { stack = []; env.open(false); });

  return { inspect, render, get value() { return top()?.value ?? null; }, get open() { return stack.length > 0; } };
}
