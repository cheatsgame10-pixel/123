let _archive = [];

async function loadArchive(){
  const root = document.getElementById('archiveRoot');
  root.innerHTML = skeletonRows(5);
  try {
    let q = db.collection('leaderHistory');
    const showDeleted = isSiteAdmin() && state.archiveShowDeleted;
    if (!showDeleted) q = q.where('deleted', '==', false);
    const snap = await q.get();
    _archive = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _archive.sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')) || (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    renderArchive();
  } catch (err){
    console.error('Архив', err);
    root.innerHTML = errorState('Не удалось загрузить архив. ' + humanError(err), 'retry-archive');
  }
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
  root.innerHTML = `<div class="archive-list">${rows.map(r => `
    <div class="archive-item${r.deleted ? ' is-deleted' : ''}">
      <div class="ai-head">
        <div>
          <div class="ai-faction">${escapeHtml(r.factionName || factionName(r.factionId))}</div>
          <div class="ai-leader">${escapeHtml(r.leader)}</div>
        </div>
        <span class="badge ${archiveResultTone(r.result)}">${escapeHtml(r.result)}</span>
      </div>
      <div class="ai-dates mono">${fmtISO(r.startDate)} — ${fmtISO(r.endDate)}</div>
      ${r.reason ? `<div class="ai-field"><b>Причина:</b> ${escapeHtml(r.reason)}</div>` : ''}
      ${r.comment ? `<div class="ai-field"><b>Комментарий:</b> ${escapeHtml(r.comment)}</div>` : ''}
      ${r.extra ? `<div class="ai-field"><b>Дополнительно:</b> ${escapeHtml(r.extra)}</div>` : ''}
      ${r.deleted ? `<div class="ai-field deleted-note">Удалено ${fmtDateTime(r.deletedAt)}${r.deletedByEmail ? ' · ' + escapeHtml(r.deletedByEmail) : ''}${r.deleteReason ? ' · ' + escapeHtml(r.deleteReason) : ''}</div>` : ''}
      ${isSiteAdmin() ? `<div class="ai-actions">
        <button class="btn btn-ghost btn-sm" data-action="versions" data-type="leaderHistory" data-id="${escapeHtml(r.id)}">История</button>
        ${r.deleted
          ? `<button class="btn btn-ghost btn-sm" data-action="archive-restore" data-id="${escapeHtml(r.id)}">Восстановить</button>
             <button class="btn btn-ghost btn-sm danger-text" data-action="purge" data-type="leaderHistory" data-id="${escapeHtml(r.id)}">Удалить навсегда</button>`
          : `<button class="btn btn-ghost btn-sm" data-action="archive-edit" data-id="${escapeHtml(r.id)}">Изменить</button>
             <button class="btn btn-ghost btn-sm danger-text" data-action="archive-delete" data-id="${escapeHtml(r.id)}">Удалить</button>`}
      </div>` : ''}
    </div>`).join('')}</div>`;
}

function archiveResultTone(result){
  if (!result) return 'badge-grey';
  if (result.startsWith('Успешно') || result.startsWith('Завершил')) return 'badge-green';
  if (result === 'Был снят') return 'badge-red';
  return 'badge-yellow';
}

function openArchiveModal(id){
  const r = id ? _archive.find(x => x.id === id) : null;
  openModal(`
    <h2>${r ? 'Запись архива' : 'Новая запись архива'}</h2>
    <div class="field"><label for="aFaction">Фракция</label><select id="aFaction">${factionGroupedOptionsHtml(r ? r.factionId : '', 'Выберите фракцию')}</select></div>
    <div class="field"><label for="aLeader">Лидер</label><input type="text" id="aLeader" maxlength="120" value="${escapeHtml(r ? r.leader : '')}" placeholder="Никнейм лидера"></div>
    <div class="grid-2">
      <div class="field"><label for="aStart">Начало срока</label><input type="date" id="aStart" value="${escapeHtml(r ? r.startDate : '')}"></div>
      <div class="field"><label for="aEnd">Конец срока</label><input type="date" id="aEnd" value="${escapeHtml(r ? r.endDate : '')}"></div>
    </div>
    <div class="field"><label for="aResult">Результат</label><select id="aResult">${ARCHIVE_RESULTS.map(x => `<option${r && r.result === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label for="aReason">Причина</label><input type="text" id="aReason" maxlength="300" value="${escapeHtml(r ? r.reason || '' : '')}"></div>
    <div class="field"><label for="aComment">Комментарий</label><textarea id="aComment" rows="3" maxlength="2000">${escapeHtml(r ? r.comment || '' : '')}</textarea></div>
    <div class="field"><label for="aExtra">Дополнительная информация</label><textarea id="aExtra" rows="2" maxlength="2000">${escapeHtml(r ? r.extra || '' : '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="aSaveBtn" data-action="archive-save" data-id="${escapeHtml(r ? r.id : '')}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
}

async function saveArchive(id){
  const btn = document.getElementById('aSaveBtn');
  const factionId = document.getElementById('aFaction').value;
  const leader = document.getElementById('aLeader').value.trim();
  const startDate = document.getElementById('aStart').value;
  const endDate = document.getElementById('aEnd').value;
  const result = document.getElementById('aResult').value;
  const reason = document.getElementById('aReason').value.trim();
  const comment = document.getElementById('aComment').value.trim();
  const extra = document.getElementById('aExtra').value.trim();
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
    loadArchive();
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
    loadArchive();
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
    loadArchive();
  } catch (err){
    failToast(err, 'Не удалось восстановить запись');
  }
}
