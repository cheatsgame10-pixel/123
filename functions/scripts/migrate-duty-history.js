'use strict';
// Dry run by default. Run with --apply only against the intended Firebase project.
const admin = require('firebase-admin');
const {nameOf} = require('../domain');
admin.initializeApp();
const db = admin.firestore();

async function migrate() {
  const apply = process.argv.includes('--apply');
  const [users, weeks] = await Promise.all([db.collection('users').get(), db.collection('dutyWeeks').get()]);
  const profiles = new Map(users.docs.map(doc => [doc.id, doc.data()]));
  const scopes = new Map(); let pending = []; let weekCount = 0; let userCount = 0;
  async function flush() {
    if (!pending.length) return;
    if (apply) {
      // Transactions preserve replies/completions written after the initial scan.
      const operations = pending;
      await db.runTransaction(async tx => {
        const current = await Promise.all(operations.map(op => tx.get(op.ref)));
        current.forEach((snap, index) => {
          if (!snap.exists) return;
          const patch = operations[index].patch(snap.data());
          if (patch) tx.update(snap.ref, patch);
        });
      });
    }
    pending = [];
  }
  for (const doc of weeks.docs) {
    const week = doc.data();
    if (!week.factionId || !Array.isArray(week.tasks)) continue;
    let missing = false;
    for (const task of week.tasks) {
      for (const uid of new Set([...(task.assignees || []), ...(task.completedBy || [])])) {
        if (!profiles.has(uid)) continue;
        if (!scopes.has(uid)) scopes.set(uid, new Set());
        scopes.get(uid).add(week.factionId);
        if (!task.assigneeNames?.[uid]) missing = true;
      }
    }
    if (!missing) continue;
    weekCount++;
    pending.push({ref: doc.ref, patch: current => ({tasks: (current.tasks || []).map(task => {
      const names = {...task.assigneeNames};
      for (const uid of new Set([...(task.assignees || []), ...(task.completedBy || [])])) {
        if (!names[uid] && profiles.has(uid)) names[uid] = nameOf(profiles.get(uid));
      }
      return {...task, assigneeNames: names};
    })})});
    if (pending.length >= 200) await flush();
  }
  await flush();
  for (const [uid, factions] of scopes) {
    const previous = new Set(profiles.get(uid).dutyHistoryFactions || []);
    if ([...factions].every(fid => previous.has(fid))) continue;
    userCount++;
    pending.push({ref: db.collection('users').doc(uid), patch: current => ({dutyHistoryFactions: [...new Set([...(current.dutyHistoryFactions || []), ...factions])]})});
    if (pending.length >= 200) await flush();
  }
  await flush();
  console.log(JSON.stringify({mode: apply ? 'applied' : 'dry-run', weeks: weekCount, users: userCount}));
}
migrate().catch(error => { console.error(error.message); process.exitCode = 1; });
