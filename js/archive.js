let _archive = [];
let _archiveUnsub = null;

async function loadArchive(){
  const root = document.getElementById('archiveRoot');
  if (_archiveUnsub) { _archiveUnsub(); _archiveUnsub = null; }
  root.innerHTML = skeletonRows(5);
  let q = db.collection('leaderHistory');
  const showDeleted = isSiteAdmin() && state.archiveShowDeleted;
  if (!showDeleted) q = q.where('deleted', '==', false);
  _archiveUnsub = q.onSnapshot(snap => {
    _archive = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _archive.sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')) || (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    renderArchive();
  }, err => {
    console.error('Архив', err);
    root.innerHTML = errorState('Не удалось загрузить архив. ' + humanError(err), 'retry-archive');
  });
}

function archiveDurationDays(startDate, endDate){
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.floor((end - start) / 86400000) + 1;
}

function renderArchive(){
  const root = document.getElementById('archiveRoot');
  document.getElementById('archiveAddBtn').hidden = !isSiteAdmin();
  document.getElementById('archiveDeletedWrap').hidden = !isSiteAdmin();
  const q = state.archiveSearch.trim().toLowerCase();
  const rows = q ? _archive.filter(r =>
    (r.factionName || '').toLowerCase().includes(q) ||
    (r.leader || '').toLowerCase().includes(q) ||
    (r.result || '').toLowerCase().includes(q)) : _archive;
  if (!rows.length){
    root.innerHTML = emptyState(_archive.length ? 'Ничего не найдено.' : 'Архив пока пуст.');
    return;
  }

  const visible = rows.filter(r => !r.deleted);
  const successful = visible.filter(r => String(r.result || '').startsWith('Успешно') || String(r.result || '').startsWith('Завершил')).length;
  const removed = visible.filter(r => r.result === 'Не справился с грузом ответственности' || r.result === 'Был снят').length;
  const voluntary = visible.filter(r => String(r.result || '').includes('собственному')).length;

  root.innerHTML = `
    <div class="archive-overview">
      <div class="archive-stat"><span>Записей</span><b>${visible.length}</b></div>
      <div class="archive-stat"><span>Успешных сроков</span><b class="archive-stat-good">${successful}</b></div>
      <div class="archive-stat"><span>Снято</span><b class="archive-stat-bad">${removed}</b></div>
      <div class="archive-stat"><span>Ушли сами</span><b>${voluntary}</b></div>
    </div>
    <div class="archive-grid">${rows.map(r => {
      const duration = archiveDurationDays(r.startDate, r.endDate);
      return `<article class="archive-card${r.deleted ? ' is-deleted' : ''}">
        <div class="archive-card-top">
          <div class="archive-card-faction">${factionChipHtml(r.factionId, r.factionName || factionName(r.factionId))}</div>
          <span class="badge ${archiveResultTone(r.result)}">${escapeHtml(r.result)}</span>
        </div>
        <div class="archive-leader-block">
          <span class="archive-label">Лидер</span>
          <strong class="archive-leader-name">${escapeHtml(r.leader || '—')}</strong>
        </div>
        <div class="archive-term">
          <div><span>Начало срока</span><b>${fmtISO(r.startDate)}</b></div>
          <span class="archive-term-arrow">→</span>
          <div><span>Конец срока</span><b>${fmtISO(r.endDate)}</b></div>
        </div>
        <div class="archive-card-bottom">
          <span class="archive-duration">${duration ? `${duration} дн.` : 'Срок не определён'}</span>
          ${r.deleted ? `<span class="archive-deleted-note">Удалено ${fmtDateTime(r.deletedAt)}</span>` : ''}
        </div>
        ${isSiteAdmin() ? `<div class="ai-actions archive-actions">
          <button class="btn btn-ghost btn-sm" data-action="versions" data-type="leaderHistory" data-id="${escapeHtml(r.id)}">История</button>
          ${r.deleted
            ? `<button class="btn btn-ghost btn-sm" data-action="archive-restore" data-id="${escapeHtml(r.id)}">Восстановить</button>
               <button class="btn btn-ghost btn-sm danger-text" data-action="purge" data-type="leaderHistory" data-id="${escapeHtml(r.id)}">Удалить навсегда</button>`
            : `<button class="btn btn-ghost btn-sm" data-action="archive-edit" data-id="${escapeHtml(r.id)}">Изменить</button>
               <button class="btn btn-ghost btn-sm danger-text" data-action="archive-delete" data-id="${escapeHtml(r.id)}">Удалить</button>`}
        </div>` : ''}
      </article>`;
    }).join('')}</div>`;
}

function archiveResultTone(result){
  if (!result) return 'badge-grey';
  if (result.startsWith('Успешно') || result.startsWith('Завершил')) return 'badge-green';
  if (result === 'Не справился с грузом ответственности' || result === 'Был снят') return 'badge-red';
  return 'badge-yellow';
}

function openArchiveModal(id){
  const r = id ? _archive.find(x => x.id === id) : null;
  openModal(`
    <div class="archive-modal-head">
      <div>
        <div class="modal-kicker">Архив лидеров</div>
        <h2>${r ? 'Изменить запись' : 'Добавить завершённый срок'}</h2>
      </div>
    </div>
    <div class="field"><label for="aFaction">Фракция</label><select id="aFaction">${factionGroupedOptionsHtml(r ? r.factionId : '', 'Выберите фракцию')}</select></div>
    <div class="field"><label for="aLeader">Лидер</label><input type="text" id="aLeader" maxlength="120" value="${escapeHtml(r ? r.leader : '')}" placeholder="Никнейм лидера"></div>
    <div class="grid-2 archive-date-grid">
      <div class="field"><label for="aStart">Начало срока</label><input type="date" id="aStart" value="${escapeHtml(r ? r.startDate : '')}"></div>
      <div class="field"><label for="aEnd">Конец срока</label><input type="date" id="aEnd" value="${escapeHtml(r ? r.endDate : '')}"></div>
    </div>
    <div class="field"><label for="aResult">Результат</label><select id="aResult">${ARCHIVE_RESULTS.map(x => `<option${r && r.result === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="aSaveBtn" data-action="archive-save" data-id="${escapeHtml(r ? r.id : '')}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
  if (typeof flatpickr === 'function') {
    const locale = flatpickr.l10ns?.ru || undefined;
    ['#aStart', '#aEnd'].forEach(selector => {
      const input = document.querySelector(selector);
      if (input) flatpickr(input, {
        locale,
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd.m.Y',
        allowInput: true,
        disableMobile: false
      });
    });
  }
}

async function saveArchive(id){
  const btn = document.getElementById('aSaveBtn');
  const factionId = document.getElementById('aFaction').value;
  const leader = document.getElementById('aLeader').value.trim();
  const startDate = document.getElementById('aStart').value;
  const endDate = document.getElementById('aEnd').value;
  const result = document.getElementById('aResult').value;
  const existing = id ? _archive.find(x => x.id === id) : null;
  // Старые дополнительные поля сохраняем в данных для совместимости, но больше не показываем в интерфейсе.
  const reason = existing?.reason || '';
  const comment = existing?.comment || '';
  const extra = existing?.extra || '';
  if (!factionId || !leader || !startDate || !endDate){ toast('Заполните фракцию, лидера и даты', 'error'); return; }
  if (endDate < startDate){ toast('Конец срока не может быть раньше начала', 'error'); return; }
  setLoading(btn, true);
  try {
    const batch = db.batch();
    const data = { factionId, factionName: factionName(factionId), leader, startDate, endDate, result, reason, comment, extra, updatedAt: FieldValue.serverTimestamp() };
    if (id){
      const old = _archive.find(x => x.id === id);
      addVersion(batch, 'leaderHistory', id, stripSystem(old));
      batch.update(db.collection('leaderHistory').doc(id), data);
      addAudit(batch, { action: 'Изменил запись архива лидеров', objectType: 'leaderHistory', objectId: id, oldValue: { leader: old.leader, result: old.result, startDate: old.startDate, endDate: old.endDate }, newValue: { leader, result, startDate, endDate }, faction: factionId });
    } else {
      const ref = db.collection('leaderHistory').doc();
      batch.set(ref, { ...data, deleted: false, createdAt: FieldValue.serverTimestamp(), createdBy: state.user.uid });
      addAudit(batch, { action: 'Добавил запись в архив лидеров', objectType: 'leaderHistory', objectId: ref.id, newValue: { leader, result, startDate, endDate }, faction: factionId });
    }
    await batch.commit();
    closeModal();
    toast('Запись сохранена');
  } catch (err){
    failToast(err, 'Не удалось сохранить запись');
  } finally {
    setLoading(btn, false);
  }
}

async function deleteArchive(id){
  const r = _archive.find(x => x.id === id);
  if (!r) return;
  const res = await confirmDialog({ title: 'Удалить запись?', text: `${r.factionName} — ${r.leader}. Запись скроется из публичного архива, но её можно будет восстановить.`, okText: 'Удалить', reason: true });
  if (!res) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'leaderHistory', id, stripSystem(r));
    batch.update(db.collection('leaderHistory').doc(id), {
      deleted: true, deletedAt: FieldValue.serverTimestamp(), deletedBy: state.user.uid, deletedByEmail: state.user.email, deleteReason: res.reason, updatedAt: FieldValue.serverTimestamp()
    });
    addAudit(batch, { action: 'Удалил запись архива лидеров', objectType: 'leaderHistory', objectId: id, oldValue: { leader: r.leader, result: r.result }, additionalInfo: res.reason, faction: r.factionId });
    await batch.commit();
    toast('Запись удалена');
  } catch (err){
    failToast(err, 'Не удалось удалить запись');
  }
}

async function restoreArchive(id){
  const r = _archive.find(x => x.id === id);
  if (!r) return;
  const ok = await confirmDialog({ title: 'Восстановить запись?', text: `${r.factionName} — ${r.leader} снова появится в публичном архиве.`, okText: 'Восстановить', danger: false });
  if (!ok) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'leaderHistory', id, stripSystem(r));
    batch.update(db.collection('leaderHistory').doc(id), {
      deleted: false, restoredAt: FieldValue.serverTimestamp(), restoredBy: state.user.uid, updatedAt: FieldValue.serverTimestamp()
    });
    addAudit(batch, { action: 'Восстановил удалённую запись архива', objectType: 'leaderHistory', objectId: id, newValue: { leader: r.leader, result: r.result }, faction: r.factionId });
    await batch.commit();
    toast('Запись восстановлена');
  } catch (err){
    failToast(err, 'Не удалось восстановить запись');
  }
}
