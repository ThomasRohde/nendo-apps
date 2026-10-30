async page => {
  // The Terrain view in the fixture broker, measured where the person meets it. tools/Review-Terrain.ps1
  // fills the placeholders and runs this with playwright-cli. What the eye would check is measured
  // from the SVG. A failure names the last check that passed, so a timeout says where it happened.
  const checks = [];
  try { return await (async () => {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push(`Browser dialog (${dialog.type()}): ${dialog.message()}`); dialog.dismiss().catch(() => {}); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('__BROKER_URL__');
  const fixture = '__TERRAIN_FIXTURE__';
  const empty = '__TERRAIN_EMPTY_FIXTURE__';
  const PAPER = { width: 1000, height: 700, left: 56, right: 24, top: 36, bottom: 56 };
  const plotW = PAPER.width - PAPER.left - PAPER.right, plotH = PAPER.height - PAPER.top - PAPER.bottom;
  await page.waitForFunction(() => window.broker && window.toolbarRules);
  await page.evaluate(fixture => {
    window.broker.offerWrites(true); window.broker.offerChrome(true);
    window.broker.offerSettings({ 'check.cycle': true, 'check.range': true, 'check.upward': true, 'check.orphan': true, 'check.no-user': true, paper: 'white' });
    window.broker.setFixture(fixture);
  }, fixture);
  const origin = await page.evaluate(() => window.broker.viewOrigin);
  const mounted = async (previous = null) => {
    for (let i = 0; i < 200; i++) { const f = page.frames().find(f => f !== previous && !f.isDetached() && f.url().startsWith(origin + '/')); if (f) return f; await page.waitForTimeout(50); }
    throw Error('The Terrain frame did not mount.');
  };
  let frame = await mounted();
  const ready = () => frame.waitForFunction(() => window.terrain?.ready === true, null, { timeout: 15000 })
    .catch(() => { throw Error('The Terrain view never said it was ready: a module of the package failed to load or to run.'); });
  await ready();
  const command = (id, value = null) => page.evaluate(({ id, value }) => window.broker.command(id, value), { id, value });
  const records = entity => page.evaluate(entity => window.broker.records(entity), entity);
  const requests = method => page.evaluate(method => window.broker.requests.filter(r => r.m === method).map(r => r.p), method);
  const settle = (ms = 400) => page.waitForTimeout(ms);
  const until = (fn, arg, message, ms = 5000) => frame.waitForFunction(fn, arg, { timeout: ms }).catch(() => { throw Error(message); });
  const digits = value => value && typeof value === 'object' && '$nendoNumber' in value ? value.$nendoNumber : String(value);
  checks.push('the view loads the demo landscape');

  // Nendo's own rules accept the toolbar the view declares.
  await settle();
  assert((await page.evaluate(() => window.broker.chromeRefusals)).length === 0, `Nendo refused the toolbar: ${JSON.stringify(await page.evaluate(() => window.broker.chromeRefusals))}`);
  const toolbar = (await page.evaluate(() => window.broker.toolbars)).at(-1);
  const mapSelect = toolbar.items.find(i => i.id === 'map');
  assert(mapSelect && mapSelect.options.length === fixture.records['tr.map'].length, `The map list does not name the ${fixture.records['tr.map'].length} maps: ${JSON.stringify(mapSelect)}`);
  checks.push('Nendo accepts the toolbar, which lists every map');

  // The paper fits the frame: with the text pane and the side panel open, in a narrow window, the
  // map's right edge stays inside the frame until the person zooms.
  const window0 = page.viewportSize();
  await page.setViewportSize({ width: 1100, height: window0?.height ?? 800 });
  await settle();
  const edges = await frame.evaluate(() => ({ text: !document.getElementById('text-pane').hidden,
    wrap: document.getElementById('paper-wrap').getBoundingClientRect().right, svg: document.querySelector('#paper svg').getBoundingClientRect().right }));
  assert(edges.text && edges.svg <= edges.wrap + 0.5, `In a 1100 px window the map's right edge is at ${edges.svg}, past the frame's ${edges.wrap}.`);
  if (window0) await page.setViewportSize(window0);
  await settle();
  checks.push('the map fits the frame with the text pane open');

  // Geometry: on every map, each mark stands where its record says, measured from the SVG.
  const byId = list => new Map(list.map(r => [r.recordId, r]));
  const placements = fixture.records['tr.placement'], assessments = fixture.records['tr.assessment'], components = byId(fixture.records['tr.component']);
  const evolutionOf = p => p.exact['tr.placement.evolution'] ?? assessments.filter(a => a.values['tr.assessment.component'] === p.values['tr.placement.component'])
    .sort((a, b) => a.values['tr.assessment.date'].localeCompare(b.values['tr.assessment.date'])).at(-1)?.exact['tr.assessment.evolution'];
  let measured = 0;
  for (const map of fixture.records['tr.map']) {
    await command('map', map.recordId);
    await until(id => window.terrain.mapId === id, map.recordId, `The map ${map.recordId} never opened.`);
    await settle(150);
    const marks = await frame.evaluate(() => [...document.querySelectorAll('#paper .tr-component')].map(g => {
      const dot = g.querySelector('.tr-dot');
      return { id: g.dataset.id, cx: Number(dot.getAttribute('cx')), cy: Number(dot.getAttribute('cy')) };
    }));
    const onMap = placements.filter(p => p.values['tr.placement.map'] === map.recordId);
    assert(marks.length === onMap.length, `${map.values['tr.map.title']} draws ${marks.length} components, not ${onMap.length}.`);
    for (const p of onMap) {
      const mark = marks.find(m => m.id === p.recordId);
      const x = PAPER.left + Number(evolutionOf(p)) * plotW, y = PAPER.top + (1 - Number(p.exact['tr.placement.visibility'])) * plotH;
      assert(mark && Math.abs(mark.cx - x) < 0.02 && Math.abs(mark.cy - y) < 0.02,
        `${components.get(p.values['tr.placement.component']).values['tr.component.name']} on ${map.values['tr.map.title']} is drawn at ${JSON.stringify(mark)}, not (${x}, ${y}).`);
      measured += 1;
    }
  }
  checks.push(`${measured} marks stand at their evolution and visibility`);

  // The tea shop: stage words, labels as text, and their contrast on white paper.
  const tea = fixture.records['tr.map'].find(m => m.values['tr.map.title'] === 'Tea Shop');
  await command('map', tea.recordId);
  await until(id => window.terrain.mapId === id, tea.recordId, 'The tea shop never opened.');
  const words = await frame.evaluate(() => [...document.querySelectorAll('#paper .tr-stage')].map(t => t.textContent));
  assert(JSON.stringify(words) === JSON.stringify(['Genesis', 'Custom built', 'Product (+rental)', 'Commodity (+utility)']), `The stage words are ${JSON.stringify(words)}.`);
  const luminance = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const mode of ['light', 'dark']) {
    await page.evaluate(mode => window.broker.pushTheme(mode), mode);
    await settle(200);
    const paper = await frame.evaluate(() => document.querySelector('#paper .tr-paper').getAttribute('fill'));
    const fills = await frame.evaluate(() => [...new Set([...document.querySelectorAll('#paper text')].map(t => t.getAttribute('fill')))]);
    for (const fill of fills) assert(contrast(fill, paper) >= 4.5, `In the ${mode} theme a label of ${fill} on ${paper} has a contrast of ${contrast(fill, paper).toFixed(2)}, under 4.5.`);
  }
  checks.push('labels keep 4.5 to 1 on the paper in both themes');

  // Keys: the components are one tab stop; an arrow goes to the nearest component; Shift and an arrow nudge by 0.01.
  const kettle = placements.find(p => p.values['tr.placement.map'] === tea.recordId && components.get(p.values['tr.placement.component']).values['tr.component.name'] === 'Kettle');
  await frame.evaluate(id => document.querySelector(`#paper .tr-component[data-id="${id}"]`).focus(), kettle.recordId);
  const stops = await frame.evaluate(() => [...document.querySelectorAll('#paper .tr-component')].filter(g => g.tabIndex === 0).length);
  assert(stops === 1, `The components are ${stops} tab stops, not one.`);
  await page.keyboard.press('ArrowRight');
  const right = await frame.evaluate(() => document.activeElement?.closest?.('.tr-component')?.querySelector('.tr-name')?.textContent);
  assert(right && right !== 'Kettle', `ArrowRight from Kettle went nowhere (${right}).`);
  await frame.evaluate(id => document.querySelector(`#paper .tr-component[data-id="${id}"]`).focus(), kettle.recordId);
  await page.keyboard.press('Enter');
  await until(id => window.terrain.selected === id, kettle.recordId, 'Enter on Kettle did not select it.');
  await page.keyboard.press('Shift+ArrowRight');
  await until(() => window.terrain.waiting === 1, null, 'Shift+ArrowRight did not make one waiting edit.');
  const nudged = await frame.evaluate(id => Number(document.querySelector(`#paper .tr-component[data-id="${id}"] .tr-dot`).getAttribute('cx')), kettle.recordId);
  const kettleX = PAPER.left + Number(evolutionOf(kettle)) * plotW;
  assert(Math.abs(nudged - (kettleX + 0.01 * plotW)) < 0.05, `Shift+ArrowRight moved Kettle to x ${nudged}, not ${kettleX + 0.01 * plotW}.`);
  const hollow = await frame.evaluate(id => document.querySelector(`#paper .tr-component[data-id="${id}"]`).classList.contains('tr-unconfirmed'), kettle.recordId);
  assert(hollow, 'A moved component is not drawn as unconfirmed.');
  checks.push('the keys move between components and nudge one by 0.01, drawn hollow');
  await command('discard');
  await until(() => window.terrain.waiting === 0, null, 'Discard left edits waiting.');

  // Drag and commit: the expected records, in one revision; Undo restores them exactly.
  const before = await records('tr.placement');
  const batchesBefore = (await requests('records.batch')).length;
  const dot = await frame.locator(`#paper .tr-component[data-id="${kettle.recordId}"] .tr-dot`).boundingBox();
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  const scale = (await frame.evaluate(() => document.querySelector('#paper svg').getBoundingClientRect().width)) / PAPER.width;
  await page.mouse.move(dot.x + dot.width / 2 + 0.2 * plotW * scale, dot.y + dot.height / 2 - 0.1 * plotH * scale, { steps: 6 });
  await page.mouse.up();
  await until(() => window.terrain.waiting === 1, null, 'A drag did not make one waiting edit.');
  await page.mouse.move(dot.x + dot.width / 2 + 0.2 * plotW * scale, dot.y + dot.height / 2 - 0.1 * plotH * scale);
  // A second drag of the same component is the same field set.
  const dot2 = await frame.locator(`#paper .tr-component[data-id="${kettle.recordId}"] .tr-dot`).boundingBox();
  await page.mouse.move(dot2.x + dot2.width / 2, dot2.y + dot2.height / 2);
  await page.mouse.down();
  await page.mouse.move(dot2.x + dot2.width / 2 + 0.05 * plotW * scale, dot2.y + dot2.height / 2, { steps: 4 });
  await page.mouse.up();
  await settle(150);
  assert(await frame.evaluate(() => window.terrain.waiting) === 1, 'Two drags of one component are not one waiting edit.');
  await command('confirm', false);
  await command('commit');
  await until(() => window.terrain.waiting === 0, null, 'Commit left edits waiting.');
  const batches = (await requests('records.batch')).slice(batchesBefore);
  assert(batches.length === 1 && batches[0].writes.length === 1 && batches[0].writes[0].recordId === kettle.recordId,
    `Commit did not write the one placement in one batch: ${JSON.stringify(batches)}`);
  const written = batches[0].writes[0].values;
  assert(Math.abs(Number(digits(written['tr.placement.evolution'])) - (0.35 + 0.25)) < 0.015 && Math.abs(Number(digits(written['tr.placement.visibility'])) - 0.53) < 0.015,
    `The drag wrote ${JSON.stringify(written)}, not about [0.53, 0.6].`);
  checks.push('a drag commits as one field set in one revision');
  await command('undo');
  await page.waitForFunction(id => window.broker.requests.filter(r => r.m === 'records.undo').length === 1, kettle.recordId, { timeout: 5000 });
  await settle(400);
  const after = await records('tr.placement');
  const strip = r => JSON.stringify([r.recordId, Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v === null || v === undefined ? null : digits(v)]).filter(([, v]) => v !== null).sort())]);
  assert(JSON.stringify(after.map(strip)) === JSON.stringify(before.map(strip)), 'Undo of the commit did not restore the placements exactly.');
  checks.push('Undo takes the commit back exactly');

  // A typed line makes the same waiting edit as the matching drag.
  await command('confirm', true);
  const text = await frame.evaluate(() => document.getElementById('text').value);
  assert(/component Kettle \[0\.43, 0\.35\] label \[-57, 4\] inertia/.test(text), `The text pane does not print Kettle: ${text.slice(0, 400)}`);
  await frame.evaluate(next => { const area = document.getElementById('text'); area.focus(); area.value = next; area.dispatchEvent(new Event('input')); },
    text.replace('component Kettle [0.43, 0.35]', 'component Kettle [0.43, 0.5]'));
  await until(() => window.terrain.waiting === 1, null, 'A typed position did not make one waiting edit.');
  const typedX = await frame.evaluate(id => Number(document.querySelector(`#paper .tr-component[data-id="${id}"] .tr-dot`).getAttribute('cx')), kettle.recordId);
  assert(Math.abs(typedX - (PAPER.left + 0.5 * plotW)) < 0.02, `The typed position drew Kettle at x ${typedX}.`);
  await frame.evaluate(() => { const area = document.getElementById('text'); area.value += '\ncomponent Broken [0.5]\n'; area.dispatchEvent(new Event('input')); });
  await until(() => document.querySelectorAll('#text-errors li').length === 1, null, 'A line that does not parse is not marked.');
  assert(await frame.evaluate(() => window.terrain.waiting) === 1, 'A line that does not parse changed the map.');
  await frame.evaluate(() => document.getElementById('text').blur());
  await command('discard');
  await until(() => window.terrain.waiting === 0, null, 'Discard left the typed edit.');
  checks.push('typing makes the edit a drag makes, and a broken line changes nothing');

  // Export: SVG keeps every label as text; PNG is 1000 × 700 times 1, 2 and 4.
  // The file is read from the blob the view hands the browser, as the Archi lane reads its own.
  await frame.evaluate(() => {
    window.savedBlobs = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.savedBlobs.push(blob); return original(blob); };
  });
  const download = async id => {
    const [file] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), command(id)]);
    const bytes = new Uint8Array(await frame.evaluate(async () => [...new Uint8Array(await window.savedBlobs.at(-1).slice(0, 4096).arrayBuffer())]));
    const text = await frame.evaluate(() => window.savedBlobs.at(-1).type.startsWith('image/svg') ? window.savedBlobs.at(-1).text() : '');
    return { name: file.suggestedFilename(), bytes, text };
  };
  const svg = await download('svg');
  const svgText = svg.text;
  const names = fixture.records['tr.component'].filter(c => placements.some(p => p.values['tr.placement.map'] === tea.recordId && p.values['tr.placement.component'] === c.recordId)).map(c => c.values['tr.component.name']);
  for (const name of names) assert(svgText.includes(`>${name}</text>`), `The SVG has no text for ${name}.`);
  assert(!/<image|<foreignObject/.test(svgText), 'The SVG draws a label as a picture.');
  for (const [id, factor] of [['png1', 1], ['png2', 2], ['png4', 4]]) {
    const png = await download(id);
    const b = png.bytes;
    const width = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], height = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    assert(b[1] === 0x50 && width === 1000 * factor && height === 700 * factor, `${png.name} is ${width} × ${height}, not ${1000 * factor} × ${700 * factor}.`);
  }
  checks.push('SVG keeps labels as text and PNG is 1×, 2× and 4×');

  // The validator: on, it lists what is wrong and outlines it; a click selects the component.
  await command('text', false);
  const cyc = fixture.records['tr.map'].find(m => m.values['tr.map.title'] === 'Order to delivery');
  await command('map', cyc.recordId);
  await until(id => window.terrain.mapId === id, cyc.recordId, 'Order to delivery never opened.');
  await command('validate', true);
  await until(() => !document.getElementById('validator').hidden, null, 'Validate did not open the validator.');
  assert(await frame.evaluate(() => !document.getElementById('validator-none').hidden), 'The clean demo map shows issues.');
  // Drag Compute above Route optimisation: the dependency now runs upward.
  const compute = placements.find(p => p.values['tr.placement.map'] === cyc.recordId && components.get(p.values['tr.placement.component']).values['tr.component.name'] === 'Compute');
  const cbox = await frame.locator(`#paper .tr-component[data-id="${compute.recordId}"] .tr-dot`).boundingBox();
  await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2 - 0.6 * plotH * scale, { steps: 6 });
  await page.mouse.up();
  await until(() => [...document.querySelectorAll('#issues button')].some(b => b.dataset.rule === 'upward'), null, 'Dragging Compute above what needs it raised no upward issue.');
  assert(await frame.evaluate(id => !!document.querySelector(`#paper .tr-component[data-id="${id}"] .tr-issue`), compute.recordId), 'The validator does not outline the component it names.');
  checks.push('the validator names an upward link and outlines its component');
  await command('discard');

  // A commit of more than 200 writes is refused before any request.
  const batchesNow = (await requests('records.batch')).length;
  await command('import');
  await until(() => document.getElementById('import').open, null, 'Import did not open its dialog.');
  const many = ['title Many', 'anchor User [0.95, 0.5]', ...Array.from({ length: 120 }, (_, i) => `component Part ${i} [${(0.1 + (i % 80) / 100).toFixed(2)}, ${(0.05 + (i % 90) / 100).toFixed(2)}]`)].join('\n');
  await frame.evaluate(text => { document.getElementById('import-text').value = text; document.querySelector('#import-form button[value="import"]').click(); }, many);
  await until(() => window.terrain.waiting > 200, null, 'The import of 120 components did not wait as edits.');
  await command('commit');
  await until(() => document.getElementById('summary').textContent.includes('at most 200'), null, 'A commit over 200 writes was not refused by its size.');
  assert((await requests('records.batch')).length === batchesNow, 'A commit over 200 writes sent a request.');
  checks.push('a commit over 200 writes is refused before any request');
  await command('discard');

  // An empty file says what to do, and New map starts one.
  const previous = frame;
  await page.evaluate(empty => { window.broker.setFixture(empty); window.broker.remount(); }, empty);
  frame = await mounted(previous);
  await ready();
  await frame.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('terrain:')) localStorage.removeItem(key); });
  await until(() => !document.getElementById('empty').hidden, null, 'An empty file does not say how to start.');
  await command('new-map');
  await until(() => window.terrain.mapId !== null && window.terrain.waiting === 1, null, 'New map made no waiting map.');
  checks.push('an empty file starts with New map');

  assert(errors.length === 0, `The view raised: ${errors.join(' | ')}`);
  return { complete: true, checks, errors };
  })(); } catch (error) {
    throw Error(`${error.message} (after: ${checks.at(-1) ?? 'nothing'})`);
  }
}
