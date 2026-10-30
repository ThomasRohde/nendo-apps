async page => {
  // A failure names the last check that passed, so a timeout says where it happened.
  const checks = [];
  try { return await (async () => {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push(`Browser dialog (${dialog.type()}): ${dialog.message()}`); dialog.dismiss().catch(() => {}); });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('__BROKER_URL__');
  const fixture = '__SLIP_FIXTURE__';
  await page.evaluate(fixture => { window.broker.offerWrites(true); window.broker.offerChrome(true); window.broker.setFixture(fixture); }, fixture);
  const origin = await page.evaluate(() => window.broker.viewOrigin);
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url().startsWith(origin + '/')) ?? null; if (!frame) await page.waitForTimeout(50); }
  assert(frame, 'The Slip frame did not mount.');
  await frame.waitForFunction(() => window.slip?.ready === true, null, { timeout: 15000 });
  const records = entity => page.evaluate(entity => window.broker.records(entity), entity);
  const command = id => page.evaluate(id => window.broker.command(id), id);
  const editor = () => frame.locator('#editor');
  // Puts text in the editor as a person would leave it, and selects it all.
  const write = async text => { await editor().fill(text); await editor().evaluate(e => e.setSelectionRange(0, e.value.length)); };
  const idle = () => frame.waitForFunction(() => !window.slip.running, null, { timeout: 15000 });

  // 1. Started from the file: the example classes are live, the Start here page is open, the
  // file is kept in, and the toolbar is Nendo's, accepted by its rules.
  assert(await frame.evaluate(() => window.slip.persisting) === true, 'With Slip\'s record types in the file, Slip must keep its work there.');
  assert((await frame.locator('#tally').textContent()).startsWith('4 classes'), `The tally must count the file's 4 classes: ${await frame.locator('#tally').textContent()}`);
  assert(await frame.locator('#title').inputValue() === 'Start here', 'The Start here page must open.');
  assert((await editor().inputValue()).includes('Welcome to Slip'), 'The editor must hold the page\'s source.');
  const refusals = await page.evaluate(() => window.broker.chromeRefusals);
  assert(refusals.length === 0, 'Nendo refused Slip\'s toolbar: ' + JSON.stringify(refusals));
  const toolbars = await page.evaluate(() => window.broker.toolbars);
  assert(toolbars.length > 0 && toolbars.at(-1).items.map(i => i.id).join(',') === 'doit,printit,stop', 'The toolbar must offer Do it, Print it and Stop.');
  assert(await frame.evaluate(() => getComputedStyle(document.getElementById('own-toolbar')).display === 'none'), 'With Nendo\'s toolbar offered, Slip draws no toolbar of its own.');
  assert(await frame.locator('#notices .notice').count() === 0, 'A file that is ready shows no notice.');
  checks.push('mount');

  // 2. Print it puts the printString after the selection and selects it; the examples run.
  const pageRecord = (await records('st.snippet'))[0];
  await write('(Rectangle width: 2 height: 3) area + (Stack new push: 4; pop)');
  await command('printit');
  await idle();
  await frame.waitForFunction(() => document.getElementById('editor').value.endsWith(' 10'));
  const selected = await editor().evaluate(e => e.value.slice(e.selectionStart, e.selectionEnd));
  assert(selected === ' 10', `Print it must select what it printed, and selected "${selected}".`);
  checks.push('print it');

  // 3. Ctrl+P and Ctrl+D in the editor, the caret's line when nothing is selected.
  await editor().fill('3 + 4\n100 factorial printString size');
  await editor().evaluate(e => { e.focus(); e.setSelectionRange(8, 8); });
  await page.keyboard.press('Control+p');
  await idle();
  await frame.waitForFunction(() => document.getElementById('editor').value === '3 + 4\n100 factorial printString size 158');
  await editor().evaluate(e => { e.focus(); e.setSelectionRange(0, 0); });
  await page.keyboard.press('Control+d');
  await idle();
  assert(await frame.locator('#result').isVisible() && (await frame.locator('#result').textContent()).includes('7'), 'Do it must show its result under the editor.');
  checks.push('keys');

  // 4. The page is kept: an edit reaches its record after the idle delay.
  await frame.waitForFunction(() => document.getElementById('saved').textContent === 'Kept in the file', null, { timeout: 5000 });
  const kept = (await records('st.snippet')).find(r => r.recordId === pageRecord.recordId);
  assert(kept.values['st.snippet.source'].includes('100 factorial printString size 158'), 'The page\'s record must hold what the editor holds.');
  checks.push('page kept');

  // 5. A class and a method made in the Workspace become records, exactly as written.
  await write('Object subclass: #Greeter instanceVariableNames: \'name\' classVariableNames: \'\' package: \'Mine\'.\nGreeter compile: \'greet\n\t^#hello\' classified: \'greeting\'.\nGreeter new greet');
  await command('printit');
  await idle();
  await frame.waitForFunction(() => document.getElementById('editor').value.endsWith(' #hello'));
  await page.waitForFunction(() => window.broker.records('st.method').some(r => r.values['st.method.selector'] === 'greet'), null, { timeout: 5000 });
  const greeter = (await records('st.class')).find(r => r.values['st.class.name'] === 'Greeter');
  assert(greeter && greeter.values['st.class.instanceVariables'] === 'name' && greeter.values['st.class.package'] === 'Mine', 'Greeter must be kept with its variables and package.');
  const greet = (await records('st.method')).find(r => r.values['st.method.selector'] === 'greet');
  assert(greet.values['st.method.source'] === 'greet\n\t^#hello' && greet.values['st.method.className'] === 'Greeter' && greet.values['st.method.side'] === 'instance', 'greet must be kept with its exact source.');
  checks.push('code kept');

  // 6. Code from outside Slip is compiled, live, and said so.
  await page.evaluate(() => {
    window.broker.put('st.method', { entityId: 'st.method', recordId: 'st.method.outside', version: 1, labels: {}, exact: {}, calculated: {},
      values: { 'st.method.className': 'Integer', 'st.method.side': 'instance', 'st.method.selector': 'triple', 'st.method.protocol': 'outside', 'st.method.source': 'triple\n\t^self * 3' } });
    window.broker.pushChanges();
  });
  await frame.waitForFunction(() => document.querySelector('#notices .notice.outside') !== null, null, { timeout: 5000 });
  await write('14 triple');
  await command('printit');
  await idle();
  assert(await editor().inputValue() === '14 triple 42', 'A method that came from outside must run.');
  assert((await frame.locator('#transcript').textContent()).includes('came in from outside Slip'), 'The Transcript must say that code came from outside.');
  checks.push('outside code');

  // 7. A run that never ends leaves the page answering, and Stop ends it.
  await write('[true] whileTrue: [3 + 4]');
  await command('doit');
  await frame.waitForFunction(() => window.slip.running === true);
  const started = Date.now();
  await frame.evaluate(() => document.title);
  assert(Date.now() - started < 1000, 'The page must answer while Slip runs.');
  await page.waitForTimeout(300);
  const stopEnabled = await page.evaluate(() => window.broker.toolbars.at(-1).items.find(i => i.id === 'stop').disabled !== true);
  assert(stopEnabled, 'Stop must be offered while Slip runs.');
  await command('stop');
  await idle();
  assert((await frame.locator('#result .title').textContent()) === 'Stopped.', 'Stop must end the run and say so.');
  checks.push('stop');

  // 8. An error shows its message and its trace.
  await write('Stack new pop');
  await command('doit');
  await idle();
  const problem = await frame.locator('#result').textContent();
  assert(problem.includes('The stack is empty.') && problem.includes('Stack>>pop'), `An error must name itself and its trace: ${problem}`);
  checks.push('error');

  // 9. Nendo's dark theme reaches the page.
  await page.evaluate(() => window.broker.pushTheme('dark'));
  await frame.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const background = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(background !== 'rgb(249, 249, 250)', `The dark theme must change the canvas, which is ${background}.`);
  checks.push('theme');

  // 10. A file without Slip's record types: Slip still runs, keeps nothing, and says how to
  // give the file the record types. This broker takes no proposals, so the button says so.
  const bare = { ...fixture, schema: { entities: [], commands: [] }, records: {} };
  await page.evaluate(bare => { window.broker.setFixture(bare); window.broker.remount(); }, bare);
  frame = null;
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(50);
    frame = page.frames().find(f => f.url().startsWith(origin + '/')) ?? null;
    if (frame && await frame.evaluate(() => window.slip?.ready === true).catch(() => false)) break;
  }
  assert(await frame.evaluate(() => window.slip.persisting) === false, 'A file without the record types cannot keep Slip\'s work.');
  assert(await frame.locator('#notices .notice.setup button').count() === 1, 'Slip must offer to ask Nendo for its record types.');
  await write('6 * 7');
  await command('printit');
  await idle();
  assert(await editor().inputValue() === '6 * 7 42', 'Slip must run in a file that cannot keep its work.');
  await frame.locator('#notices .notice.setup button').click();
  await frame.waitForFunction(() => document.getElementById('status').textContent.includes('cannot take a proposal'));
  checks.push('no record types');

  assert(errors.length === 0, 'Browser exceptions: ' + errors.join(' | '));
  return { complete: true, checks, errors };
  })(); } catch (error) { return { complete: false, checks, failed: error.message, errors: [] }; }
}
