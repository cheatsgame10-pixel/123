const RECOVERY_SOURCES = [
  { col: 'reports', type: 'report', label: 'Отчёты', title: r => `${r.leaderName} — ${r.factionName}, ${fmtISO(r.date)}` },
  { col: 'leaderHistory', type: 'leaderHistory', label: 'Архив лидеров', title: r => `${r.factionName} — ${r.leader}` },
  { col: 'news', type: 'news', label: 'Новости', title: r => r.title },
  { col: 'supportTickets', type: 'supportTicket', label: 'Заявки поддержки', title: r => r.title },
  { col: 'dutyAssignments', type: 'dutyAssignment', label: 'Обязанности', title: r => `${r.name} — ${r.factionName}` }
];

const VERSION_COLLECTIONS = { report: 'reports', reports: 'reports', leaderHistory: 'leaderHistory', news: 'news', supportTicket: 'supportTickets', dutyAssignment: 'dutyAssignments', user: 'users', faction: 'factions' };
const RESTORABLE_KEYS = {
  reports: ['leaderName', 'date', 'problems', 'improvements', 'comment'],
  leaderHistory: ['factionId', 'factionName', 'leader', 'startDate', 'endDate', 'result', 'reason', 'comment', 'extra'],
  news: ['title', 'text'],
  dutyAssignments: ['dateFrom', 'dateTo', 'status', 'comment'],
  factions: ['name', 'forumKey', 'category', 'active'],
  users: ['displayName']
};

let _deleted = [];

async function loadRecovery(){
  const root = document.getElementById('recoveryRoot');
  if (!isSiteAdmin()){ root.innerHTML = lockedState('Раздел доступен администратору сайта.'); return; }
  root.innerHTML = skeletonRows(5);
  try {
    _deleted = [];
    for (const src of RECOVERY_SOURCES){
      const snap = await db.collection(src.col).where('deleted', '==', true).limit(100).get();
      snap.forEach(d => _deleted.push({ src, id: d.id, data: d.data() }));
    }
    _deleted.sort((a, b) => (toDate(b.data.deletedAt)?.getTime() || 0) - (toDate(a.data.deletedAt)?.getTime() || 0));
    renderRecovery();
  } catch (err){
    console.error('Восстановление', err);
    root.innerHTML = errorState('Не удалось загрузить удалённые данные. ' + humanError(err), 'retry-recovery');
  }
}

function renderRecovery(){
  const root = document.getElementById('recoveryRoot');
  root.innerHTML = `
    <div class="notice">Здесь лежит всё, что было удалено. Записи можно восстановить или удалить навсегда — второе необратимо и требует подтверждения словом.</div>
    ${!_deleted.length ? emptyState('Удалённых записей нет.') : `<div class="duty-list">${_deleted.map(x => `
      <div class="duty-item is-deleted">
        <div class="duty-main">
          <div class="duty-title"><span class="chip chip-sm">${escapeHtml(x.src.label)}</span> ${escapeHtml(x.src.title(x.data))}</div>
          <div class="duty-meta">Удалено ${fmtDateTime(x.data.deletedAt)} · ${escapeHtml(x.data.deletedByEmail || x.data.deletedBy || '—')}${x.data.deleteReason ? ' · причина: ' + escapeHtml(x.data.deleteReason) : ''}</div>
        </div>
        <div class="duty-side">
          <div class="r-actions">
            <button class="btn btn-ghost btn-sm" data-action="versions" data-type="${escapeHtml(x.src.col)}" data-id="${escapeHtml(x.id)}">История</button>
            <button class="btn btn-ghost btn-sm" data-action="recover" data-type="${escapeHtml(x.src.col)}" data-id="${escapeHtml(x.id)}">Восстановить</button>
            <button class="btn btn-ghost btn-sm danger-text" data-action="purge" data-type="${escapeHtml(x.src.col)}" data-id="${escapeHtml(x.id)}">Удалить навсегда</button>
          </div>
        </div>
      </div>`).join('')}</div>`}`;
}

function recoveryLabel(col){
  const s = RECOVERY_SOURCES.find(x => x.col === col);
  return s ? s.label : col;
}

async function recoverRecord(col, id){
  const ok = await confirmDialog({ title: 'Восстановить запись?', text: `${recoveryLabel(col)}: запись снова станет активной.`, okText: 'Восстановить', danger: false });
  if (!ok) return;
  try {
    const ref = db.collection(col).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw { code: 'not-found' };
    const data = snap.data();
    const batch = db.batch();
    addVersion(batch, col, id, stripSystem(data));
    batch.update(ref, { deleted: false, restoredAt: FieldValue.serverTimestamp(), restoredBy: state.user.uid, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: `Восстановил удалённую запись (${recoveryLabel(col)})`, objectType: col, objectId: id, faction: data.factionId || null });
    await batch.commit();
    toast('Запись восстановлена');
    refreshAfterRecovery(col);
  } catch (err){
    failToast(err, 'Не удалось восстановить');
  }
}

async function purgeRecord(col, id){
  const res = await confirmDialog({ title: 'Удалить навсегда?', text: `${recoveryLabel(col)}: запись будет уничтожена физически, восстановить её будет невозможно. Версии и записи журнала сохранятся.`, okText: 'Удалить навсегда', typed: 'УДАЛИТЬ' });
  if (!res) return;
  try {
    const ref = db.collection(col).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw { code: 'not-found' };
    const data = snap.data();
    const batch = db.batch();
    addVersion(batch, col, id, stripSystem(data));
    addAudit(batch, { action: `Удалил навсегда запись (${recoveryLabel(col)})`, objectType: col, objectId: id, oldValue: pickSummary(col, data), faction: data.factionId || null });
    batch.delete(ref);
    await batch.commit();
    toast('Запись удалена навсегда');
    refreshAfterRecovery(col);
  } catch (err){
    failToast(err, 'Не удалось удалить');
  }
}

function pickSummary(col, data){
  const src = RECOVERY_SOURCES.find(x => x.col === col);
  return { title: src ? src.title(data) : col };
}

function refreshAfterRecovery(col){
  if (state.tab === 'recovery') loadRecovery();
  if (state.tab === 'reports' && col === 'reports') loadReports();
  if (state.tab === 'archive' && col === 'leaderHistory') loadArchive();
  if (state.tab === 'news' && col === 'news') loadNews();
  if (state.tab === 'support' && col === 'supportTickets') loadTickets();
  if (state.tab === 'duties' && col === 'dutyAssignments') loadDuties();
}

async function openVersionsModal(type, id){
  const col = VERSION_COLLECTIONS[type] || type;
  const box = openModal(`<h2>История версий</h2><p class="sub mono">${escapeHtml(col)} · ${escapeHtml(id)}</p><div id="versionsList">${skeletonRows(3)}</div><div class="modal-actions"><button class="btn btn-ghost" data-action="modal-close">Закрыть</button></div>`);
  try {
    const snap = await db.collection('dataVersions').where('objectId', '==', id).limit(100).get();
    const versions = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => (VERSION_COLLECTIONS[v.objectType] || v.objectType) === col);
    versions.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    const keys = RESTORABLE_KEYS[col] || [];
    const el = box.querySelector('#versionsList');
    if (!versions.length){ el.innerHTML = '<div class="hint">Сохранённых версий пока нет. Версия создаётся при каждом изменении или удалении.</div>'; return; }
    el.innerHTML = `<div class="timeline">${versions.map((v, i) => `
      <div class="tl-item">
        <div class="tl-time mono">v${versions.length - i}<br>${fmtDateTime(v.createdAt)}</div>
        <div class="tl-body">
          <div class="hint">Сохранил: ${escapeHtml(v.createdByEmail || v.createdBy)}</div>
          <div class="tl-diff">${keys.filter(k => v.data && v.data[k] !== undefined).map(k => `<div><span class="hint">${escapeHtml(k)}:</span> ${escapeHtml(String(v.data[k]))}</div>`).join('') || '<span class="hint">Нет отображаемых полей</span>'}</div>
          ${keys.length ? `<button class="btn btn-ghost btn-sm" data-action="version-restore" data-type="${escapeHtml(col)}" data-id="${escapeHtml(id)}" data-version="${escapeHtml(v.id)}">Вернуть эту версию</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
  } catch (err){
    box.querySelector('#versionsList').innerHTML = errorState('Не удалось загрузить версии. ' + humanError(err));
  }
}

async function restoreVersion(col, id, versionId){
  const keys = RESTORABLE_KEYS[col] || [];
  if (!keys.length) return;
  const ok = await confirmDialog({ title: 'Вернуть версию?', text: 'Текущие значения будут сохранены как новая версия, затем запись примет значения выбранной версии.', okText: 'Вернуть', danger: false });
  if (!ok) return;
  try {
    const vSnap = await db.collection('dataVersions').doc(versionId).get();
    if (!vSnap.exists) throw { code: 'not-found' };
    const vData = vSnap.data().data || {};
    const ref = db.collection(col).doc(id);
    const cur = await ref.get();
    if (!cur.exists) throw { code: 'not-found' };
    const patch = { updatedAt: FieldValue.serverTimestamp() };
    keys.forEach(k => { if (vData[k] !== undefined) patch[k] = vData[k]; });
    const batch = db.batch();
    addVersion(batch, col, id, stripSystem(cur.data()));
    batch.update(ref, patch);
    addAudit(batch, { action: `Вернул предыдущую версию записи (${recoveryLabel(col)})`, objectType: col, objectId: id, additionalInfo: `версия ${versionId}`, faction: cur.data().factionId || null });
    await batch.commit();
    closeModal();
    toast('Версия восстановлена');
    refreshAfterRecovery(col);
  } catch (err){
    failToast(err, 'Не удалось вернуть версию');
  }
}
