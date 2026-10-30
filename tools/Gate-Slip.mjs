async page => {
  // A failure names the last check that passed, so a timeout says where it happened.
  const checks = [];
  // Each check is also said as it passes, so a run that hangs shows where.
  const passed = name => { checks.push(name); console.log(`check ${name}`); };
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
  assert(toolbars.length > 0 && toolbars.at(-1).items.map(i => i.id).join(',') === 'doit,printit,inspectit,browseit,debugit,stop', 'The toolbar must offer Do it, Print it, Inspect it, Browse it, Debug it and Stop.');
  assert(await frame.evaluate(() => getComputedStyle(document.getElementById('own-toolbar')).display === 'none'), 'With Nendo\'s toolbar offered, Slip draws no toolbar of its own.');
  assert(await frame.locator('#notices .notice').count() === 0, 'A file that is ready shows no notice.');
  passed('mount');

  // 2. Print it puts the printString after the selection and selects it; the examples run.
  const pageRecord = (await records('st.snippet'))[0];
  await write('(Rectangle width: 2 height: 3) area + (Stack new push: 4; pop)');
  await command('printit');
  await idle();
  await frame.waitForFunction(() => document.getElementById('editor').value.endsWith(' 10'));
  const selected = await editor().evaluate(e => e.value.slice(e.selectionStart, e.selectionEnd));
  assert(selected === ' 10', `Print it must select what it printed, and selected "${selected}".`);
  passed('print it');

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
  passed('keys');

  // 4. The page is kept: an edit reaches its record after the idle delay.
  await frame.waitForFunction(() => document.getElementById('saved').textContent === 'Kept in the file', null, { timeout: 5000 });
  const kept = (await records('st.snippet')).find(r => r.recordId === pageRecord.recordId);
  assert(kept.values['st.snippet.source'].includes('100 factorial printString size 158'), 'The page\'s record must hold what the editor holds.');
  passed('page kept');

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
  passed('code kept');

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
  passed('outside code');

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
  passed('stop');

  // 8. An error shows its message and its trace.
  await write('Stack new pop');
  await command('doit');
  await idle();
  const problem = await frame.locator('#result').textContent();
  assert(problem.includes('The stack is empty.') && problem.includes('Stack>>pop'), `An error must name itself and its trace: ${problem}`);
  passed('error');

  // 9. Nendo's dark theme reaches the page.
  await page.evaluate(() => window.broker.pushTheme('dark'));
  await frame.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const background = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(background !== 'rgb(249, 249, 250)', `The dark theme must change the canvas, which is ${background}.`);
  passed('theme');

  // 11. The browser lists the file's packages, classes, protocols and methods, and a method
  // edited and accepted there is compiled and kept, exactly as written.
  const code = () => frame.locator('#b-code');
  const values = id => frame.locator(`#${id} li`).evaluateAll(items => items.map(li => li.dataset.value));
  const chosen = id => frame.locator(`#${id} li[aria-selected=true]`).evaluateAll(items => items.map(li => li.dataset.value).join(','));
  const pick = (id, value) => frame.locator(`#${id} li[data-value="${value}"]`).click();
  await frame.locator('#tab-browser').click();
  assert(await frame.locator('#browser-pane').isVisible() && !await frame.locator('#workspace-pane').isVisible(), 'The Browser tab must show the browser in place of the Workspace.');
  assert((await values('b-packages')).includes('Examples') && (await values('b-packages')).includes('Kernel'), 'The browser must list the Examples and Kernel packages.');
  await pick('b-packages', 'Examples');
  const exampleClasses = await values('b-classes');
  assert(['Circle', 'Rectangle', 'Shape', 'Stack'].every(name => exampleClasses.includes(name)) && exampleClasses.includes('Integer'), `Examples must list its four classes and Integer, which it extends: ${exampleClasses}`);
  assert(await frame.locator('#b-classes li.extended[data-value="Integer"]').count() === 1, 'A class a package only extends is marked as extended.');
  await pick('b-classes', 'Stack');
  assert((await code().inputValue()).startsWith('Object subclass: #Stack\n\tinstanceVariableNames: \'items\''), 'A class with no method chosen shows its definition.');
  await pick('b-protocols', 'operations');
  assert((await values('b-methods')).join(',') === 'pop,push:,top', `The operations protocol holds pop, push: and top: ${await values('b-methods')}`);
  await pick('b-methods', 'push:');
  assert(await code().inputValue() === 'push: anObject\n\t^items addLast: anObject', 'A chosen method shows its source.');
  await code().fill('push: anObject\n\t"Put anObject on top."\n\t^items addLast: anObject');
  await code().focus();
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => window.broker.records('st.method').find(r => r.recordId === 'st.method.stack-push')?.values['st.method.source'] === 'push: anObject\n\t"Put anObject on top."\n\t^items addLast: anObject', null, { timeout: 5000 });
  assert(await frame.locator('#b-code').getAttribute('data-dirty') === 'false', 'An accepted method is no longer marked as changed.');
  passed('browser accept');

  // 12. A new method goes into the chosen protocol; a parse error is shown where it is and
  // keeps nothing; an edit not accepted is dropped only on a second choice.
  await frame.locator('#b-new-method').click();
  await code().fill('peek\n\t^items isEmpty ifTrue: [nil] ifFalse: [items last]');
  await frame.locator('#b-accept').click();
  await page.waitForFunction(() => window.broker.records('st.method').some(r => r.values['st.method.className'] === 'Stack' && r.values['st.method.selector'] === 'peek' && r.values['st.method.protocol'] === 'operations'), null, { timeout: 5000 });
  assert(await chosen('b-methods') === 'peek', 'The new method is chosen once it compiles.');
  await frame.locator('#b-new-method').click();
  await code().fill('broken\n\t^(1 + ');
  await frame.locator('#b-accept').click();
  assert(await frame.locator('#b-problem').isVisible() && /expected/i.test(await frame.locator('#b-problem').textContent()), 'A parse error must be shown under the code.');
  assert(!(await records('st.method')).some(r => r.values['st.method.selector'] === 'broken'), 'A method that does not compile is not kept.');
  await pick('b-methods', 'pop');
  assert(await code().inputValue() === 'broken\n\t^(1 + ' && (await frame.locator('#status').textContent()).includes('not accepted'), 'The first choice away from an edit not accepted keeps it and says so.');
  await pick('b-methods', 'pop');
  assert((await code().inputValue()).startsWith('pop\n'), 'The second choice drops the edit and shows the method.');
  passed('browser new method');

  // 13. A class definition changed in the browser reshapes the class, keeps its methods
  // working, and is kept; the comment is there to read.
  await pick('b-classes', 'Stack');
  await code().fill((await code().inputValue()).replace("instanceVariableNames: 'items'", "instanceVariableNames: 'items limit'"));
  await frame.locator('#b-accept').click();
  await page.waitForFunction(() => window.broker.records('st.class').find(r => r.recordId === 'st.class.stack')?.values['st.class.instanceVariables'] === 'items limit', null, { timeout: 5000 });
  await frame.locator('#b-comment').click();
  assert((await code().inputValue()).startsWith('A last-in, first-out stack'), 'Comment shows the class comment.');
  passed('browser definition');

  // 14. Inspect it opens the inspector on the result; a field opens the object it holds, and
  // the inspector evaluates with self as the object.
  await frame.locator('#tab-workspace').click();
  await write('Stack new push: 7; push: 8; yourself');
  await command('inspectit');
  await idle();
  await frame.waitForFunction(() => !document.getElementById('inspector').hidden);
  assert(await frame.locator('#i-class').textContent() === 'Stack', 'The inspector shows the class of what it inspects.');
  const labels = await frame.locator('#i-fields button').evaluateAll(items => items.map(b => b.dataset.label));
  assert(labels.join(',') === 'items,limit', `A Stack's fields are items and limit: ${labels}`);
  await frame.locator('#i-fields button[data-label="items"]').click();
  assert(await frame.locator('#i-class').textContent() === 'OrderedCollection' && await frame.locator('#i-path').textContent() === 'self › items', 'A field opens the object it holds.');
  await frame.locator('#i-back').click();
  assert(await frame.locator('#i-class').textContent() === 'Stack', 'Back returns to the object before.');
  await frame.locator('#i-eval').fill('self peek');
  await frame.locator('#i-eval').evaluate(e => { e.focus(); e.setSelectionRange(0, e.value.length); });
  await page.keyboard.press('Control+p');
  await idle();
  await frame.waitForFunction(() => document.getElementById('i-eval').value === 'self peek 8');
  passed('inspector');

  // 15. Browse it opens the browser on the class the caret is on.
  await write('Circle radius: 2');
  await editor().evaluate(e => { e.focus(); e.setSelectionRange(2, 2); });
  await page.keyboard.press('Control+Shift+B');
  await frame.waitForFunction(() => !document.getElementById('browser-pane').hidden);
  assert(await chosen('b-classes') === 'Circle' && (await code().inputValue()).startsWith('Shape subclass: #Circle'), 'Browse it must show Circle\'s definition.');
  await frame.locator('#i-close').click();
  assert(await frame.locator('#inspector').isHidden(), 'Close hides the inspector.');
  await frame.locator('#tab-workspace').click();
  passed('browse it');

  // 16. An error leaves a notifier; Debug opens the debugger on the method that raised it,
  // with the send it waits on marked, and Proceed runs on to the end.
  const marked = () => frame.locator('#d-source mark').textContent();
  await write('Stack new pop');
  await command('doit');
  await idle();
  await frame.locator('#result button[data-act="debug"]').click();
  await frame.waitForFunction(() => !document.getElementById('debugger-pane').hidden);
  assert(await frame.locator('#d-stack li[aria-selected=true]').textContent() === 'Stack>>pop', 'The debugger must open on Stack>>pop.');
  assert(await marked() === 'error:', `The frame must mark the send it waits on: ${await marked()}`);
  assert(await frame.locator('#d-title').textContent() === 'The stack is empty.', 'The debugger names the error.');
  await frame.locator('#d-proceed').click();
  await frame.waitForFunction(() => document.getElementById('debugger-pane').hidden && !document.getElementById('workspace-pane').hidden);
  assert((await frame.locator('#result').textContent()).includes('nil'), 'Proceed answers nil from the error and runs on.');
  assert(await frame.locator('#tab-debugger').isHidden(), 'With nothing to debug, the Debugger tab goes.');
  passed('debugger');

  // 17. Debug it stops before the first statement; Over steps one statement and shows the
  // temps; Proceed ends it with the result where Do it would show it.
  await write('| a | a := 3 + 4. a * 2');
  await editor().focus();
  await page.keyboard.press('Control+Shift+D');
  await frame.waitForFunction(() => !document.getElementById('debugger-pane').hidden);
  assert(await marked() === '+', 'Debug it marks the first send.');
  await frame.locator('#d-over').click();
  await frame.waitForFunction(() => document.querySelector('#d-source mark')?.textContent === '*');
  const temps = await frame.locator('#d-fields button').evaluateAll(items => items.map(b => b.textContent));
  assert(temps.includes('a7'), `Over must show a as 7: ${temps}`);
  await frame.locator('#d-proceed').click();
  await frame.waitForFunction(() => document.getElementById('debugger-pane').hidden);
  assert((await frame.locator('#result').textContent()).includes('14'), 'Proceed shows the result.');
  passed('debug it');

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
  passed('no record types');

  assert(errors.length === 0, 'Browser exceptions: ' + errors.join(' | '));
  return { complete: true, checks, errors };
  })(); } catch (error) { return { complete: false, checks, failed: error.message, errors: [] }; }
}
