// The validator: what is wrong with a map, as Archi's validator says what is wrong with a model.
// Each rule is a setting the package declares (check. and the rule's ID, ADR-0038), so a file can
// turn one off for everyone and a computer can keep its own choice. Pure: no DOM.

import { mapView, toNumber } from './model.mjs';

export const RULES = [
  { id: 'cycle', level: 'Error', title: 'Dependency cycles', help: 'Dependency links that form a loop.' },
  { id: 'range', level: 'Error', title: 'Positions out of range', help: 'A position or a movement\'s target outside 0 to 1.' },
  { id: 'upward', level: 'Warning', title: 'Links that run upward', help: 'A dependency that points at a component drawn above the one that needs it.' },
  { id: 'orphan', level: 'Warning', title: 'Orphans', help: 'A component with no path from a user of its map.' },
  { id: 'no-user', level: 'Warning', title: 'Maps without a user', help: 'A map with no user to anchor it.' },
];
export const LEVELS = ['Error', 'Warning', 'Hint'];

const inRange = digits => digits !== null && digits !== undefined && toNumber(digits) >= 0 && toNumber(digits) <= 1;

/**
 * Every issue on one map, each `{rule, level, text, componentIds, linkIds}`, errors first.
 * `enabled(ruleId)` says whether a rule runs; every rule runs when it is left out.
 */
export function validate(records, mapId, { enabled = () => true, asOf = null } = {}) {
  const view = mapView(records, mapId, asOf);
  if (!view) return [];
  const issues = [];
  const rule = id => RULES.find(r => r.id === id);
  const add = (id, text, componentIds = [], linkIds = []) => { if (enabled(id)) issues.push({ rule: id, level: rule(id).level, text, componentIds, linkIds }); };
  const name = id => view.byComponent.get(id)?.name ?? id;
  const dependencies = view.links.filter(l => l.kind === 'Dependency');

  // cycle: a loop of dependencies, each loop said once, from its first component by name.
  const next = new Map(view.items.map(i => [i.componentId, []]));
  for (const link of dependencies) next.get(link.from)?.push(link);
  const seenLoops = new Set();
  const state = new Map();
  const path = [];
  const walk = id => {
    state.set(id, 'open');
    path.push({ id, out: null });
    for (const link of next.get(id) ?? []) {
      path.at(-1).out = link.linkId;
      if (state.get(link.to) === 'open') {
        const loop = path.slice(path.findIndex(step => step.id === link.to));
        const ids = loop.map(step => step.id);
        const key = [...ids].sort().join('|');
        if (!seenLoops.has(key)) {
          seenLoops.add(key);
          const names = ids.map(name);
          add('cycle', `Dependencies form a loop: ${[...names, names[0]].join(' → ')}.`, ids, loop.map(step => step.out));
        }
      } else if (!state.has(link.to)) walk(link.to);
    }
    path.pop();
    state.set(id, 'done');
  };
  for (const item of view.items) if (!state.has(item.componentId)) walk(item.componentId);

  // range: positions and movement targets outside 0 to 1.
  for (const item of view.items) {
    if (!inRange(item.visibility) || !inRange(item.evolution)) add('range', `${item.name} stands at [${item.visibility}, ${item.evolution}], outside 0 to 1.`, [item.componentId]);
  }
  for (const movement of view.movements) {
    if (!inRange(movement.to)) add('range', `${name(movement.componentId)} is to evolve to ${movement.to}, outside 0 to 1.`, [movement.componentId]);
  }

  // upward: the component needed is drawn above the one that needs it.
  for (const link of dependencies) {
    const from = view.byComponent.get(link.from), to = view.byComponent.get(link.to);
    if (toNumber(to.visibility) > toNumber(from.visibility)) add('upward', `${from.name} depends on ${to.name}, which is drawn above it.`, [from.componentId, to.componentId], [link.linkId]);
  }

  // no-user and orphan: every component on a path from a user of the map, along any link.
  const users = view.items.filter(i => i.type === 'User');
  if (users.length === 0) {
    if (view.items.length > 0) add('no-user', `${view.title || 'This map'} has no user. Add an anchor, the user the map starts from.`);
  } else {
    const reached = new Set(users.map(u => u.componentId));
    const queue = [...reached];
    while (queue.length) {
      const id = queue.shift();
      for (const link of view.links) {
        if (link.from === id && !reached.has(link.to)) { reached.add(link.to); queue.push(link.to); }
      }
    }
    for (const item of view.items) if (!reached.has(item.componentId)) add('orphan', `${item.name} has no path from a user of this map.`, [item.componentId]);
  }

  return issues.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
}
