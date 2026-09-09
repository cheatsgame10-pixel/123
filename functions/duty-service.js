'use strict';
const crypto = require('crypto');
const d = require('./domain');
const defaults = require('./duty-defaults.json');

function availableTasks(factionId, catalog) {
  const removed = new Set(catalog.filter(t => t.active === false && (t.factionId === '*' || t.factionId === factionId)).map(t => t.name));
  return [...new Set([...defaults.pool, ...catalog.filter(t => t.active !== false && (t.factionId === '*' || t.factionId === factionId)).map(t => t.name)])]
    .filter(name => !removed.has(name) && !d.REMOVED_TASKS.includes(name));
}

function generateTasks({factionId, key, template, catalog, users, faction}) {
  const available = availableTasks(factionId, catalog);
  // An explicit empty template stays empty; it is never repopulated by defaults.
  const code = String(faction?.forumKey || factionId).toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = d.taskNames(template?.tasks || defaults.byFaction[code] || defaults.byFaction[factionId] || defaults.tasks).filter(name => available.includes(name));
  const candidates = users.filter(u => d.active(u) && (u.curatedFactions || []).includes(factionId) &&
    u.systemRole === (template?.assignmentMode === 'curators' ? 'curator' : 'curator_assistant')).sort((a, b) => a.uid.localeCompare(b.uid));
  const offset = Math.floor(Date.parse(`${key}T12:00:00Z`) / (7 * 86400000));
  return names.map((name, index) => {
    const person = template?.assignmentMode && template.assignmentMode !== 'none' && candidates.length
      ? candidates[(offset + index) % candidates.length] : null;
    return {id: crypto.randomUUID(), name, assignees: person ? [person.uid] : [], completedBy: [],
      assigneeNames: person ? {[person.uid]: d.nameOf(person)} : {}};
  });
}

function dutyService(firestore, admin) {
  const readAll = async collection => (await firestore.collection(collection).get()).docs.map(doc => ({...doc.data(), id: doc.id, ...(collection === 'users' ? {uid: doc.id} : {})}));
  async function context() { const [factions, catalog, users] = await Promise.all([readAll('factions'), readAll('dutyTypes'), readAll('users')]); return {factions, catalog, users}; }
  async function ensureWeek(factionId, key, ctx) {
    const dates = d.weekDates(key);
    const ref = firestore.collection('dutyWeeks').doc(`${factionId}_${key}`);
    return firestore.runTransaction(async tx => {
      const previousKey = new Date(Date.parse(`${key}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
      const legacyRef = firestore.collection('dutyWeeks').doc(`${factionId}_${previousKey}`);
      const [snap, legacy, templateSnap] = await Promise.all([tx.get(ref), tx.get(legacyRef), tx.get(firestore.collection('dutyTemplates').doc(factionId))]);
      if (snap.exists) return {id: ref.id, data: snap.data()};
      const legacyData = legacy.exists ? legacy.data() : null;
      const legacyWeekStart = legacyData?.weekStart ? new Date(legacyData.weekStart) : null;
      const legacyMatches = legacyWeekStart && Number.isFinite(+legacyWeekStart) && d.weekKey(legacyWeekStart) === key;
      // Older deployments keyed a week by the previous day's date. Reuse only
      // when that document actually represents the requested calendar week;
      // otherwise a genuine prior week could be returned for a new request.
      if (legacyData && legacyData.factionId === factionId && legacyMatches) {
        return {id: legacy.id, data: legacyData};
      }
      if (key < d.weekKey()) return {id: ref.id, data: {...dates, weekKey: key, factionId, tasks: [], locked: true}};
      d.requireValue(key === d.weekKey(), 'Создать можно только текущую неделю', 400);
      const template = templateSnap.exists ? templateSnap.data() : null;
      const faction = ctx.factions.find(f => f.id === factionId);
      const data = {...dates, weekKey: key, factionId, factionName: faction?.name || factionId, category: faction?.category || '',
        tasks: generateTasks({factionId, key, template, ...ctx, faction}), locked: false,
        templateId: template?.activeTemplateId || null, templateName: template?.name || '',
        createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now()};
      tx.create(ref, data);
      return {id: ref.id, data};
    });
  }
  return {context, ensureWeek};
}
module.exports = {availableTasks, generateTasks, dutyService};
