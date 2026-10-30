// Slip's records: the shape of the file (three record types), the values one class, method or
// Workspace page is kept as, and the order a file's classes are defined in. No page and no
// Nendo here: the view and the tests share it.

export const E = { cls: 'st.class', method: 'st.method', page: 'st.snippet' };

export const F = {
  cls: {
    name: 'st.class.name', superclass: 'st.class.superclass', shape: 'st.class.shape',
    instanceVariables: 'st.class.instanceVariables', classVariables: 'st.class.classVariables',
    package: 'st.class.package', comment: 'st.class.comment',
  },
  method: {
    className: 'st.method.className', side: 'st.method.side', selector: 'st.method.selector',
    protocol: 'st.method.protocol', source: 'st.method.source',
  },
  page: { title: 'st.snippet.title', source: 'st.snippet.source' },
};

export const SIDE = { instance: 'instance', class: 'class' };
export const SETUP_TITLE = 'Slip: keep Smalltalk classes, methods and Workspace pages in this file';

const text = (entityId, fieldId, displayName, required = false) =>
  ({ operationType: 'schema.addField', payload: { entityId, fieldId, displayName, storageKind: 'text', required, presentation: 'singleLine', options: [] } });
const long = (entityId, fieldId, displayName, required = false) =>
  ({ operationType: 'schema.addField', payload: { entityId, fieldId, displayName, storageKind: 'text', required, presentation: 'longText', options: [] } });

/**
 * The operations that give a file Slip's three record types. `plain` leaves out the choice
 * colours, which a view's proposal on Nendo 1.0.0 cannot carry.
 */
export function schemaOperations({ plain = false } = {}) {
  const operations = [
    { operationType: 'schema.createEntity', payload: { entityId: E.cls, displayName: 'Smalltalk class' } },
    text(E.cls, F.cls.name, 'Name', true),
    text(E.cls, F.cls.superclass, 'Superclass'),
    text(E.cls, F.cls.shape, 'Shape'),
    text(E.cls, F.cls.instanceVariables, 'Instance variables'),
    text(E.cls, F.cls.classVariables, 'Class variables'),
    text(E.cls, F.cls.package, 'Package'),
    long(E.cls, F.cls.comment, 'Comment'),
    { operationType: 'schema.createEntity', payload: { entityId: E.method, displayName: 'Smalltalk method' } },
    text(E.method, F.method.className, 'Class', true),
    { operationType: 'schema.addField', payload: { entityId: E.method, fieldId: F.method.side, displayName: 'Side', storageKind: 'text', required: true,
      presentation: 'singleChoice', options: [SIDE.instance, SIDE.class] } },
    { operationType: 'schema.setChoiceMetadata', payload: { entityId: E.method, fieldId: F.method.side, choiceId: SIDE.instance, displayName: 'Instance side', retired: false, tone: 'blue' } },
    { operationType: 'schema.setChoiceMetadata', payload: { entityId: E.method, fieldId: F.method.side, choiceId: SIDE.class, displayName: 'Class side', retired: false, tone: 'violet' } },
    text(E.method, F.method.selector, 'Selector'),
    text(E.method, F.method.protocol, 'Protocol'),
    long(E.method, F.method.source, 'Source', true),
    { operationType: 'schema.createEntity', payload: { entityId: E.page, displayName: 'Workspace page' } },
    text(E.page, F.page.title, 'Title', true),
    long(E.page, F.page.source, 'Source'),
  ];
  return plain ? operations.filter(o => o.operationType !== 'schema.setChoiceMetadata') : operations;
}

/** True when the schema has every record type and field Slip keeps. */
export function hasSchema(schema) {
  const entities = new Map((schema?.entities ?? []).map(e => [e.entityId, new Set(e.fields.map(f => f.fieldId))]));
  const need = { [E.cls]: F.cls, [E.method]: F.method, [E.page]: F.page };
  return Object.entries(need).every(([entityId, fields]) => entities.has(entityId) && Object.values(fields).every(f => entities.get(entityId).has(f)));
}

const words = list => list.join(' ');

/** A class's values as a record keeps them. */
export function classValues(vm, cls) {
  return {
    [F.cls.name]: cls.name,
    [F.cls.superclass]: cls.superclass ? cls.superclass.name : '',
    [F.cls.shape]: ['variable', 'bytes'].includes(cls.format) ? cls.format : 'fixed',
    [F.cls.instanceVariables]: words(cls.ivars),
    [F.cls.classVariables]: words([...cls.classVars.keys()]),
    [F.cls.package]: cls.package,
    [F.cls.comment]: cls.comment,
  };
}

/** A method's values as a record keeps them. */
export function methodValues(vm, owner, method) {
  return {
    [F.method.className]: vm.instanceClass(owner).name,
    [F.method.side]: owner.isMeta ? SIDE.class : SIDE.instance,
    [F.method.selector]: method.selector,
    [F.method.protocol]: method.protocol ?? '',
    [F.method.source]: method.source,
  };
}

export const methodKey = (className, side, selector) => `${className} ${side === SIDE.class ? 'class ' : ''}${selector}`;
export const recordMethodKey = values => methodKey(values[F.method.className], values[F.method.side], values[F.method.selector]);

const differs = (a, b) => Object.keys(a).some(k => (a[k] ?? '') !== (b[k] ?? ''));
export { differs as valuesDiffer };

/**
 * The class records in an order that defines every superclass before its subclasses. A class
 * whose superclass is neither the kernel's nor in the list comes last, and fails when defined.
 */
export function definitionOrder(classRecords, known) {
  const byName = new Map(classRecords.map(r => [r.values[F.cls.name], r]));
  const done = new Set(), order = [], visiting = new Set();
  const visit = r => {
    const name = r.values[F.cls.name];
    if (done.has(name) || visiting.has(name)) return;
    visiting.add(name);
    const parent = byName.get(r.values[F.cls.superclass]);
    if (parent && !known(r.values[F.cls.superclass])) visit(parent);
    visiting.delete(name);
    done.add(name);
    order.push(r);
  };
  for (const r of [...classRecords].sort((a, b) => String(a.values[F.cls.name]).localeCompare(String(b.values[F.cls.name])))) visit(r);
  return order;
}

/**
 * Defines the classes and compiles the methods of a file's records into an image, quietly:
 * nothing it loads is written back. Answers {classes, methods, problems}.
 */
export function loadRecords(image, classRecords, methodRecords) {
  const vm = image.vm;
  const problems = [];
  let classes = 0, methods = 0;
  vm.quiet++;
  try {
    const kernel = name => vm.classes[name] !== undefined;
    for (const r of definitionOrder(classRecords, kernel)) {
      const v = r.values;
      try { defineFromValues(vm, v); classes++; }
      catch (error) { problems.push(`The class ${v[F.cls.name]}: ${error.message}`); }
    }
    for (const r of methodRecords) {
      const v = r.values;
      try { compileFromValues(vm, v); methods++; }
      catch (error) { problems.push(`${methodKey(v[F.method.className], v[F.method.side], v[F.method.selector] ?? '?')}: ${error.message}`); }
    }
  } finally { vm.quiet--; }
  return { classes, methods, problems };
}

export function defineFromValues(vm, v) {
  const superName = v[F.cls.superclass] || 'Object';
  const superclass = vm.globalBinding(superName)?.f[1];
  if (!superclass || superclass.isMeta || superclass.ivars === undefined) throw new Error(`its superclass ${superName} is not defined`);
  const split = s => String(s ?? '').split(/\s+/).filter(Boolean);
  const shape = v[F.cls.shape];
  const cls = vm.defineClass({
    name: v[F.cls.name], superclass, ivars: split(v[F.cls.instanceVariables]), classVars: split(v[F.cls.classVariables]),
    pkg: v[F.cls.package] || 'Unpackaged', format: shape === 'variable' || shape === 'bytes' ? shape : null,
  });
  cls.comment = v[F.cls.comment] ?? '';
  return cls;
}

export function compileFromValues(vm, v) {
  const owner = vm.globalBinding(v[F.method.className])?.f[1];
  if (!owner || owner.isMeta || owner.ivars === undefined) throw new Error(`there is no class ${v[F.method.className]}`);
  const target = v[F.method.side] === SIDE.class ? owner.cls : owner;
  return { owner: target, method: vm.installSource(target, String(v[F.method.source] ?? ''), v[F.method.protocol] || undefined) };
}
