// A map as SVG: the two axes, the stage bands, components, links, flows, movements, inertia,
// pipelines, sourcing marks and notes. A string, so the view, the SVG export and node's tests draw
// the same thing, every label as text. Positions follow the records exactly: x is evolution and y
// is visibility, from the top.

import { STAGE_BOUNDS, toNumber } from './model.mjs';

/** The paper a map is drawn on, in its own units. */
export const PAPER = { width: 1000, height: 700, left: 56, right: 24, top: 36, bottom: 56 };

/** White paper in both themes, as Archi draws its views: ink that keeps 4.5 to 1 and more on white. */
export const WHITE = { paper: '#ffffff', ink: '#1f2328', muted: '#57606a', line: '#6e7781', band: '#d0d7de', fill: '#ffffff',
  move: '#b42318', accent: '#1f5fbf', issue: '#b42318', build: '#d0d7de', buy: '#eaeef2', outsource: '#57606a', inertia: '#1f2328' };

export function geometry(paper = PAPER) {
  const plotW = paper.width - paper.left - paper.right, plotH = paper.height - paper.top - paper.bottom;
  return {
    paper, plotW, plotH,
    x: evolution => paper.left + toNumber(evolution) * plotW,
    y: visibility => paper.top + (1 - toNumber(visibility)) * plotH,
    evolution: x => (x - paper.left) / plotW,
    visibility: y => 1 - (y - paper.top) / plotH,
  };
}

const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = value => Math.round(value * 100) / 100;
/** OnlineWardleyMaps' own offset for a label that has none. */
export const LABEL_OFFSET = [5, -10];

/**
 * The map as one SVG document. `view` is model.mapView's answer; `words` the four stage words.
 * `selected` is a placement ID, `issues` the component IDs the validator names, `colors` the paper.
 */
export function drawMap(view, { words, colors = WHITE, selected = null, issues = new Set(), paper = PAPER, title = true } = {}) {
  const g = geometry(paper);
  const c = colors;
  const out = [];
  const font = 'font-family="Segoe UI, system-ui, -apple-system, sans-serif"';
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${paper.width} ${paper.height}" width="${paper.width}" height="${paper.height}" ${font} font-size="12" role="img" aria-label="${escape(`Wardley map: ${view.title}`)}">`);
  out.push(`<defs><marker id="tr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c.move}"/></marker>`
    + `<marker id="tr-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c.ink}"/></marker></defs>`);
  out.push(`<rect class="tr-paper" x="0" y="0" width="${paper.width}" height="${paper.height}" fill="${c.paper}"/>`);

  // The axes and the stage bands.
  const left = paper.left, right = paper.width - paper.right, top = paper.top, bottom = paper.height - paper.bottom;
  out.push(`<g class="tr-axes">`);
  for (const bound of STAGE_BOUNDS) {
    const x = n(g.x(bound));
    out.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${c.band}" stroke-dasharray="4 4"/>`);
  }
  out.push(`<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${c.ink}" stroke-width="1.5" marker-end="url(#tr-flow)"/>`);
  out.push(`<line x1="${left}" y1="${bottom}" x2="${left}" y2="${top}" stroke="${c.ink}" stroke-width="1.5" marker-end="url(#tr-flow)"/>`);
  const edges = [0, ...STAGE_BOUNDS, 1];
  words.forEach((word, i) => {
    const x = n((g.x(edges[i]) + g.x(edges[i + 1])) / 2);
    out.push(`<text class="tr-stage" x="${x}" y="${bottom + 18}" text-anchor="middle" fill="${c.muted}">${escape(word)}</text>`);
  });
  out.push(`<text x="${right}" y="${bottom + 38}" text-anchor="end" fill="${c.muted}" font-weight="600">Evolution</text>`);
  out.push(`<text x="${left - 10}" y="${top}" text-anchor="end" fill="${c.muted}" transform="rotate(-90 ${left - 10} ${top})" dy="-4">Visible</text>`);
  out.push(`<text x="${left - 10}" y="${bottom}" text-anchor="start" fill="${c.muted}" transform="rotate(-90 ${left - 10} ${bottom})" dy="-4">Invisible</text>`);
  out.push(`<text x="${left - 28}" y="${n((top + bottom) / 2)}" text-anchor="middle" fill="${c.muted}" font-weight="600" transform="rotate(-90 ${left - 28} ${n((top + bottom) / 2)})">Value chain</text>`);
  if (title && view.title) out.push(`<text class="tr-title" x="${left}" y="${top - 14}" fill="${c.ink}" font-size="16" font-weight="600">${escape(view.title)}</text>`);
  out.push(`</g>`);

  const at = item => [n(g.x(item.evolution)), n(g.y(item.visibility))];

  // Pipelines under everything else on their row.
  for (const item of view.items) {
    if (!item.pipeline) continue;
    const y = g.y(item.visibility), x1 = g.x(item.pipeline.from), x2 = g.x(item.pipeline.to);
    out.push(`<rect class="tr-pipeline" x="${n(Math.min(x1, x2))}" y="${n(y - 11)}" width="${n(Math.abs(x2 - x1))}" height="22" fill="none" stroke="${c.ink}"/>`);
  }

  // Links, then flows over them.
  out.push(`<g class="tr-links">`);
  for (const link of view.links) {
    const from = view.byComponent.get(link.from), to = view.byComponent.get(link.to);
    const [x1, y1] = at(from), [x2, y2] = at(to);
    const flow = link.kind === 'Flow';
    const markers = flow ? `${link.flow !== 'Back' ? ' marker-end="url(#tr-flow)"' : ''}${link.flow !== 'Forward' ? ' marker-start="url(#tr-flow)"' : ''}` : '';
    out.push(`<line class="tr-link" data-link="${escape(link.linkId)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${flow ? c.ink : c.line}" stroke-width="${flow ? 2.5 : 1}"${link.line === 'Dashed' ? ' stroke-dasharray="5 4"' : ''}${markers}/>`);
    if (link.label) out.push(`<text class="tr-link-label" x="${n((x1 + x2) / 2 + 4)}" y="${n((y1 + y2) / 2 - 4)}" fill="${c.muted}" font-size="11">${escape(link.label)}</text>`);
  }
  out.push(`</g>`);

  // Movements: a red dashed arrow to where the component is expected to go.
  for (const movement of view.movements) {
    const item = view.byComponent.get(movement.componentId);
    const [x1, y] = at(item), x2 = n(g.x(movement.to));
    const towards = x2 >= x1 ? 1 : -1;
    out.push(`<g class="tr-movement" data-movement="${escape(movement.movementId)}"><line x1="${n(x1 + towards * 7)}" y1="${y}" x2="${n(x2 - towards * 7)}" y2="${y}" stroke="${c.move}" stroke-dasharray="5 4" marker-end="url(#tr-arrow)"/>`
      + `<circle cx="${x2}" cy="${y}" r="5" fill="${c.paper}" stroke="${c.move}"/>`);
    const name = movement.evolvedName ?? item.name;
    const [dx, dy] = movement.labelX !== null ? [toNumber(movement.labelX), toNumber(movement.labelY)] : LABEL_OFFSET;
    out.push(`<text x="${n(x2 + dx)}" y="${n(y + dy)}" fill="${c.move}">${escape(name)}</text></g>`);
  }

  // Components.
  out.push(`<g class="tr-components">`);
  for (const item of view.items) {
    const [x, y] = at(item);
    const user = item.type === 'User';
    const flagged = issues.has(item.componentId);
    const label = `${item.name}, ${item.type}, visibility ${item.visibility}, evolution ${item.evolution}${item.unconfirmed ? ', not yet confirmed' : ''}`;
    out.push(`<g class="tr-component${item.unconfirmed ? ' tr-unconfirmed' : ''}${selected === item.placementId ? ' tr-selected' : ''}" data-id="${escape(item.placementId)}" data-component="${escape(item.componentId)}" tabindex="-1" role="button" aria-label="${escape(label)}">`);
    if (selected === item.placementId) out.push(`<circle class="tr-ring" cx="${x}" cy="${y}" r="13" fill="none" stroke="${c.accent}" stroke-width="2"/>`);
    if (flagged) out.push(`<circle class="tr-issue" cx="${x}" cy="${y}" r="16" fill="none" stroke="${c.issue}" stroke-width="1.5" stroke-dasharray="3 3"/>`);
    if (!user && item.sourcing) {
      const fill = { Build: c.build, Buy: c.buy, Outsource: c.outsource }[item.sourcing];
      out.push(`<circle class="tr-sourcing" data-sourcing="${item.sourcing}" cx="${x}" cy="${y}" r="11" fill="${fill}" stroke="${c.line}" stroke-width="0.5"/>`);
    }
    if (!user && item.mark === 'Market') {
      for (const [dx, dy] of [[0, -9], [-8, 5], [8, 5]]) out.push(`<circle class="tr-market" cx="${n(x + dx)}" cy="${n(y + dy)}" r="3" fill="${c.paper}" stroke="${c.ink}"/>`);
    }
    if (!user && item.mark === 'Ecosystem') out.push(`<circle class="tr-ecosystem" cx="${x}" cy="${y}" r="14" fill="none" stroke="${c.ink}" stroke-dasharray="2 2"/>`);
    if (item.inertia && !user) out.push(`<rect class="tr-inertia" x="${n(x + 12)}" y="${n(y - 10)}" width="5" height="20" fill="${c.inertia}"/>`);
    if (user) {
      out.push(`<circle class="tr-dot" cx="${x}" cy="${y}" r="9" fill="${c.paper}" fill-opacity="0.01" stroke="none"/>`);
      out.push(`<text class="tr-name tr-user" x="${x}" y="${n(y + 4)}" text-anchor="middle" font-weight="700" fill="${c.ink}">${escape(item.name)}</text>`);
    } else {
      out.push(`<circle class="tr-dot" cx="${x}" cy="${y}" r="5" fill="${item.unconfirmed ? c.paper : c.fill}" stroke="${item.unconfirmed ? c.accent : c.ink}" stroke-width="1.5"${item.unconfirmed ? ' stroke-dasharray="2 2"' : ''}/>`);
      const [dx, dy] = item.labelX !== null && item.labelY !== null ? [toNumber(item.labelX), toNumber(item.labelY)] : LABEL_OFFSET;
      out.push(`<text class="tr-name" x="${n(x + dx)}" y="${n(y + dy)}" fill="${c.ink}">${escape(item.name)}</text>`);
    }
    out.push(`</g>`);
  }
  out.push(`</g>`);

  // Notes, annotations with their legend, accelerators and deaccelerators.
  out.push(`<g class="tr-notes">`);
  const legend = view.notes.find(note => note.kind === 'Legend');
  const annotations = view.notes.filter(note => note.kind === 'Annotation').sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  for (const note of view.notes) {
    const [first] = note.points.length ? note.points : [['0', '0']];
    const x = n(g.x(first[1])), y = n(g.y(first[0]));
    if (note.kind === 'Note') out.push(`<text class="tr-note" x="${x}" y="${y}" fill="${c.ink}" font-weight="600">${escape(note.text)}</text>`);
    if (note.kind === 'Annotation') {
      for (const [v, e] of note.points) {
        const px = n(g.x(e)), py = n(g.y(v));
        out.push(`<g class="tr-annotation"><circle cx="${px}" cy="${py}" r="9" fill="${c.paper}" stroke="${c.ink}"/><text x="${px}" y="${n(py + 4)}" text-anchor="middle" fill="${c.ink}" font-size="11">${escape(note.number ?? '')}</text></g>`);
      }
    }
    if (note.kind === 'Accelerator' || note.kind === 'Deaccelerator') {
      const d = note.kind === 'Accelerator'
        ? `M${x},${n(y - 8)} h40 v-6 l16,14 l-16,14 v-6 h-40 z`
        : `M${n(x + 56)},${n(y - 8)} h-40 v-6 l-16,14 l16,14 v-6 h40 z`;
      out.push(`<g class="tr-force"><path d="${d}" fill="${c.paper}" stroke="${c.ink}"/><text x="${n(x + 28)}" y="${n(y + 24)}" text-anchor="middle" fill="${c.ink}">${escape(note.text)}</text></g>`);
    }
  }
  if (annotations.length) {
    const [v, e] = legend?.points[0] ?? ['0.05', '0.62'];
    const x = n(g.x(e)), y = n(g.y(v));
    const lines = annotations.map((note, i) => `<text x="${n(x + 8)}" y="${n(y - 6 - (annotations.length - 1 - i) * 16)}" fill="${c.ink}" font-size="11">${escape(`${note.number ?? ''}. ${note.text}`)}</text>`);
    out.push(`<g class="tr-legend">${lines.join('')}</g>`);
  }
  out.push(`</g>`);
  out.push('</svg>');
  return out.join('\n');
}
