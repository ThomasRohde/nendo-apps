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
  await page.evaluate(fixture => { window.broker.offerWrites(true); window.broker.offerChrome(true); window.broker.setFixture(fixture);
    window.broker.offerSettings({ agentEvaluations: false }); window.broker.offerAssistant({ state: 'ready', name: 'Agent', working: false, access: 'ask' }); }, fixture);
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

  // 18. Slip keep:as: keeps an object as STON in an st.object record, kept: reads it back, and
  // Nendo records: reads the file's records; the run waits for each answer.
  await write('Slip keep: (OrderedCollection with: 1 with: \'two\') as: \'pair\'. (Slip kept: \'pair\') size + (Nendo records: \'st.snippet\') size');
  await command('printit');
  await idle();
  await frame.waitForFunction(() => /size \d+$/.test(document.getElementById('editor').value), null, { timeout: 5000 });
  const keptPair = (await records('st.object')).find(r => r.values['st.object.name'] === 'pair');
  assert(keptPair?.values['st.object.ston'] === 'OrderedCollection[1,\'two\']', `The pair must be kept as STON: ${JSON.stringify(keptPair?.values)}`);
  const pageCount = (await records('st.snippet')).length;
  assert((await editor().inputValue()).endsWith(` ${2 + pageCount}`), `kept: and records: must answer: ${await editor().inputValue()}`);
  passed('keep and records');

  // 19. An agent's evaluation waits, with the setting off, until the person presses Run, and
  // Slip answers in its record. Run them as they come turns the setting on for this computer,
  // and the next one runs by itself.
  const ask = (recordId, source) => page.evaluate(([recordId, source]) => {
    window.broker.put('st.evaluation', { entityId: 'st.evaluation', recordId, version: 1, labels: {}, exact: {}, calculated: {},
      values: { 'st.evaluation.source': source, 'st.evaluation.state': 'waiting' } });
    window.broker.pushChanges();
  }, [recordId, source]);
  const evaluation = async recordId => (await records('st.evaluation')).find(r => r.recordId === recordId);
  await ask('st.evaluation.one', '3 * 5');
  await frame.waitForFunction(() => !document.getElementById('agent-queue').hidden, null, { timeout: 5000 });
  await page.waitForTimeout(400);
  assert((await evaluation('st.evaluation.one')).values['st.evaluation.state'] === 'waiting', 'With the setting off, an evaluation must wait for the person.');
  assert((await frame.locator('#agent-queue pre').textContent()) === '3 * 5', 'The queue shows the source before it runs.');
  await frame.locator('#agent-queue button[data-act="run"]').click();
  await page.waitForFunction(() => window.broker.records('st.evaluation').some(r => r.values['st.evaluation.state'] === 'done'), null, { timeout: 5000 });
  assert((await evaluation('st.evaluation.one')).values['st.evaluation.result'] === '15', 'Slip answers with the result\'s printString.');
  await frame.waitForFunction(() => document.getElementById('agent-queue').hidden, null, { timeout: 5000 });
  await ask('st.evaluation.two', '6 * 7');
  await frame.locator('#agent-queue button[data-act="allow"]').click();
  await page.waitForFunction(() => window.broker.records('st.evaluation').find(r => r.recordId === 'st.evaluation.two')?.values['st.evaluation.state'] === 'done', null, { timeout: 5000 });
  assert((await evaluation('st.evaluation.two')).values['st.evaluation.result'] === '42', 'With the setting on, it runs by itself.');
  const settingsKept = await page.evaluate(() => window.broker.settingsKept);
  assert(settingsKept.some(s => s.id === 'agentEvaluations' && s.value === true), 'The setting is kept for this computer.');
  passed('agent evaluations');

  // 20. Ask the agent sends the stopped run's stack, and its methods as the file's records.
  await write('Stack new pop');
  await command('doit');
  await idle();
  await frame.locator('#result button[data-act="debug"]').click();
  await frame.waitForFunction(() => !document.getElementById('debugger-pane').hidden);
  await frame.locator('#d-ask').click();
  await page.waitForFunction(() => window.broker.assistantAsks.length === 1, null, { timeout: 5000 });
  const asked = await page.evaluate(() => window.broker.assistantAsks[0]);
  assert(JSON.stringify(asked).includes('The stack is empty.') && JSON.stringify(asked).includes('Stack>>pop'), `The message names the error and the stack: ${JSON.stringify(asked).slice(0, 300)}`);
  assert(JSON.stringify(asked).includes('nendo://application/entity/st.method/records?recordId=st.method.stack-pop'), 'The context points at Stack>>pop\'s record.');
  await page.evaluate(() => window.broker.answerAssistant({ reply: 'The stack was empty when pop was sent.', stopReason: 'endTurn' }));
  await frame.waitForFunction(() => document.getElementById('transcript').textContent.includes('The stack was empty when pop was sent.'), null, { timeout: 5000 });
  await frame.locator('#d-abandon').click();
  await frame.waitForFunction(() => document.getElementById('debugger-pane').hidden);
  passed('ask the agent');

  // 21. Open Cards files the app in, keeps its classes as records and opens it in the World,
  // which fills the canvas and draws in Nendo's theme. A card typed on the canvas, and a card
  // dragged to the next column, are kept in the file as the board's st.object.
  await frame.locator('#tab-workspace').click();
  await frame.locator('#w-cards').evaluate(button => button.click());
  await frame.waitForFunction(() => !document.getElementById('world-pane').hidden && window.slip.display.ops.some(op => op[0] === 'text' && op[1] === 'Cards'), null, { timeout: 10000 });
  await page.waitForFunction(() => window.broker.records('st.method').some(r => r.values['st.method.className'] === 'CardsBoard' && r.values['st.method.selector'] === 'layout'), null, { timeout: 10000 });
  assert((await records('st.class')).some(r => r.values['st.class.name'] === 'CardsCard' && r.values['st.class.package'] === 'Cards'), 'Cards\' classes must be kept as records.');
  const slipPrint = source => frame.evaluate(source => window.slip.image.print(source), source);
  const canvasBox = await frame.locator('#world').boundingBox();
  const worldExtent = await slipPrint('World extent');
  const [worldWidth, worldHeight] = worldExtent.split('@').map(Number);
  assert(Math.abs(worldWidth - (canvasBox.width - 2)) <= 1 && Math.abs(worldHeight - (canvasBox.height - 2)) <= 1 && worldWidth > 600, `The World must take the canvas's size inside its border: ${worldExtent} for ${canvasBox.width}x${canvasBox.height}.`);
  const backdrop = async () => frame.evaluate(() => window.slip.display.ops.find(op => op[0] === 'fill')?.[5]);
  const bodyColour = async () => frame.evaluate(() => getComputedStyle(document.body).backgroundColor.replace('rgb(', 'rgba(').replace(')', ', 1)'));
  assert(await backdrop() === await bodyColour(), `The World's background must be Nendo's canvas token: ${await backdrop()} and ${await bodyColour()}.`);
  await page.evaluate(() => window.broker.pushTheme('light'));
  await frame.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  const light = await bodyColour();
  await frame.waitForFunction(light => window.slip.display.ops.find(op => op[0] === 'fill')?.[5] === light, light, { timeout: 5000 });
  await page.evaluate(() => window.broker.pushTheme('dark'));
  // The colour is the token's, read when the World draws: a changed token reaches the morphs.
  await frame.evaluate(() => { document.documentElement.style.setProperty('--canvas', '#ffaa00'); window.slip.display.refresh(); });
  await frame.waitForFunction(() => window.slip.display.ops.find(op => op[0] === 'fill')?.[5] === 'rgba(255, 170, 0, 1)', null, { timeout: 5000 })
    .catch(async () => { throw Error(`The World's background must follow the --canvas token: ${await backdrop()}`); });
  await frame.evaluate(() => { document.documentElement.style.removeProperty('--canvas'); window.slip.display.refresh(); });
  const onCanvas = async source => { const [x, y] = (await slipPrint(source)).split('@').map(Number); return [canvasBox.x + 1 + x, canvasBox.y + 1 + y]; };
  const field = await onCanvas('(World submorphs first submorphs detect: [:m | m isKindOf: TextFieldMorph]) center');
  await page.mouse.click(...field);
  await page.keyboard.type('Buy milk');
  await page.keyboard.press('Enter');
  const board = async () => (await records('st.object')).find(r => r.values['st.object.name'] === 'cards')?.values['st.object.ston'] ?? '';
  await page.waitForFunction(() => window.broker.records('st.object').some(r => r.values['st.object.name'] === 'cards' && r.values['st.object.ston'].includes('Buy milk')), null, { timeout: 5000 });
  assert(await frame.evaluate(() => window.slip.display.ops.some(op => op[0] === 'text' && op[1] === 'Buy milk')), 'The new card must be drawn.');
  const from = await onCanvas('World submorphs first columns first cards first center');
  const to = await onCanvas('World submorphs first columns second bounds topLeft + (40 @ 30)');
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(from[0] + 40, from[1] + 10, { steps: 4 });
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => /^\[\[[^\]]*\],\['Drag this card to Doing'/.test(window.broker.records('st.object').find(r => r.values['st.object.name'] === 'cards')?.values['st.object.ston'] ?? ''), null, { timeout: 5000 });
  assert((await board()).startsWith('[[\'Add a card: type it above, then press Enter\',\'Buy milk\'],[\'Drag this card to Doing\''), `The dragged card must be kept in Doing: ${await board()}`);
  passed('world and cards');

  // 22. Open Sheets files the spreadsheet in as records and opens it on its example. A formula
  // typed on the canvas, with a cell pointed at by a click, is calculated, drawn in its cell and
  // kept; a dragged range is summed in the status line; Ctrl+C and Ctrl+V move the references.
  await frame.locator('#w-sheets').click();
  await frame.waitForFunction(() => window.slip.display.ops.some(op => op[0] === 'text' && op[1] === 'Sheets'), null, { timeout: 10000 });
  await page.waitForFunction(() => window.broker.records('st.method').filter(r => r.values['st.method.className']?.startsWith('Sheet')).length > 200, null, { timeout: 20000 });
  assert((await records('st.class')).filter(r => r.values['st.class.package'] === 'Sheets').length >= 18, 'Sheets\' classes must be kept as records.');
  const grid = 'World submorphs first grid';
  const cellCentre = async place => onCanvas(`(${grid} rectOf: ${place}) center`);
  await page.mouse.click(...await cellCentre('6 @ 2'));
  await page.keyboard.type('=');
  await page.mouse.click(...await cellCentre('4 @ 7'));
  await page.keyboard.type('/4');
  await page.keyboard.press('Enter');
  await frame.waitForFunction(() => window.slip.image.print('World submorphs first sheet sourceAt: 6 @ 2') === "'=D7/4'", null, { timeout: 5000 });
  assert(await slipPrint('World submorphs first sheet at: \'F2\'') === '(737/20)', 'The formula must be calculated exactly.');
  const f2 = await slipPrint(`${grid} rectOf: 6 @ 2`);
  const [[fx, fy], [fr]] = f2.split(' corner: ').map(p => p.split('@').map(Number));
  await frame.waitForFunction(() => window.slip.display.ops.some(op => op[0] === 'text' && op[1] === '36.85'), null, { timeout: 5000 }).catch(() => {});
  const drawn = await frame.evaluate(() => window.slip.display.ops.find(op => op[0] === 'text' && op[1] === '36.85'));
  assert(drawn && drawn[2] > fx && drawn[2] < fr && drawn[3] > fy && drawn[3] < fy + 26, `36.85 must be drawn inside F2 (${f2}): ${JSON.stringify(drawn)}`);
  await page.waitForFunction(() => /'F2':'=D7\/4'/.test(window.broker.records('st.object').find(r => r.values['st.object.name'] === 'sheet')?.values['st.object.ston'] ?? ''), null, { timeout: 5000 });
  // The page counts the presses of a double click itself: the second press opens the editor.
  await page.mouse.dblclick(...await cellCentre('6 @ 2'));
  await frame.waitForFunction(grid => window.slip.image.print(`${grid} isEditing & (${grid} editText = '=D7/4')`) === 'true', grid, { timeout: 5000 })
    .catch(async () => { throw Error(`A double click on F2 must edit its formula: ${await slipPrint(`${grid} editText`)}`); });
  await page.keyboard.press('Escape');
  const top = await cellCentre('3 @ 2'), bottom = await cellCentre('3 @ 5');
  await page.mouse.move(...top);
  await page.mouse.down();
  await page.mouse.move(...bottom, { steps: 5 });
  await page.mouse.up();
  await frame.waitForFunction(() => window.slip.display.ops.some(op => op[0] === 'text' && op[1].startsWith('Sum 80.65')), null, { timeout: 5000 });
  await page.mouse.click(...await cellCentre('6 @ 2'));
  await page.keyboard.press('Control+c');
  await page.mouse.click(...await cellCentre('7 @ 3'));
  await page.keyboard.press('Control+v');
  await frame.waitForFunction(() => window.slip.image.print('World submorphs first sheet sourceAt: 7 @ 3') === "'=E8/4'", null, { timeout: 5000 });
  await page.keyboard.press('Control+z');
  await frame.waitForFunction(() => window.slip.image.print('World submorphs first sheet sourceAt: 7 @ 3') === "''", null, { timeout: 5000 });
  await frame.locator('#tab-workspace').click();
  passed('sheets');

  // 21. A file Slip built before kept objects and evaluations: code is kept as before, and a
  // notice offers the two later record types. This broker takes no proposals, so it says so.
  const remountWith = async next => {
    await page.evaluate(next => { window.broker.setFixture(next); window.broker.remount(); }, next);
    frame = null;
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(50);
      frame = page.frames().find(f => f.url().startsWith(origin + '/')) ?? null;
      if (frame && await frame.evaluate(() => window.slip?.ready === true).catch(() => false)) break;
    }
  };
  const older = { ...fixture, schema: { ...fixture.schema, entities: fixture.schema.entities.filter(e => ['st.class', 'st.method', 'st.snippet'].includes(e.entityId)) } };
  await remountWith(older);
  assert(await frame.evaluate(() => window.slip.persisting) === true, 'A file with the first three record types keeps code.');
  const offer = frame.locator('#notices .notice.setup');
  assert(await offer.count() === 1 && (await offer.textContent()).includes('two more record types'), 'Slip must offer the two later record types.');
  await offer.locator('button').click();
  await frame.waitForFunction(() => document.getElementById('status').textContent.includes('cannot take a proposal'));
  passed('later record types');

  // 10. A file without Slip's record types: Slip still runs, keeps nothing, and says how to
  // give the file the record types. This broker takes no proposals, so the button says so.
  const bare = { ...fixture, schema: { entities: [], commands: [] }, records: {} };
  await remountWith(bare);
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
