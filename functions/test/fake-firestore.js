'use strict';
// Transactional test double: pending writes commit only if the callback succeeds.
function fakeFirestore(seed) {
  const data = new Map(Object.entries(structuredClone(seed))); let next = 0;
  const snapshot = (path) => ({id: path.split('/').pop(), exists: data.has(path), data: () => structuredClone(data.get(path))});
  const ref = path => ({path, id: path.split('/').pop(), get: async () => snapshot(path)});
  const collection = (name, filters = []) => ({
    doc: id => ref(`${name}/${id || `generated-${++next}`}`),
    where: (field, op, value) => collection(name, [...filters, [field, op, value]]),
    get: async () => {
      const docs = [...data.keys()].filter(k => k.startsWith(`${name}/`) && filters.every(([field, op, value]) =>
        op === 'in' ? value.includes(data.get(k)[field]) : data.get(k)[field] === value)).map(snapshot);
      return {docs, forEach: fn => docs.forEach(fn)};
    },
  });
  const db = {
    collection,
    runTransaction: async fn => {
      const writes = []; let wrote = false;
      const result = await fn({
        get: async r => { if (wrote) throw new Error('Transaction read after write'); return snapshot(r.path); },
        create: (r, value) => { if (data.has(r.path)) throw new Error('Already exists'); wrote = true; writes.push([r.path, value]); },
        set: (r, value, options = {}) => { wrote = true; writes.push([r.path, options.merge ? {...data.get(r.path), ...value} : value]); },
        update: (r, value) => { if (!data.has(r.path)) throw new Error('Missing document'); wrote = true; writes.push([r.path, {...data.get(r.path), ...value}]); },
        delete: r => { wrote = true; writes.push([r.path, null]); },
      });
      writes.forEach(([path, value]) => value === null ? data.delete(path) : data.set(path, structuredClone(value)));
      return result;
    },
    data,
  };
  return db;
}
const admin = {firestore: {FieldValue: {serverTimestamp: () => ({seconds: 1800000000})}, Timestamp: {now: () => ({seconds: 1800000000})}}};
module.exports = {fakeFirestore, admin};
