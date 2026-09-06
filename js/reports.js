let _reports = [];
let _reportsCursor = null;
let _reportsHasMore = false;
const REPORTS_PAGE = 50;

async function loadReports(more){
  const list = document.getElementById('reportsList');
  if (!more){ _reports = []; _reportsCursor = null; list.innerHTML = skeletonRows(4); }
  try {
    let q = db.collection('reports');
    let sortClient = true;
    if (isSiteAdmin()){
      q = q.orderBy('createdAt', 'desc').limit(REPORTS_PAGE);
      if (_reportsCursor) q = q.startAfter(_reportsCursor);
      sortClient = false;
    } else if (isLeader()){
      q = q.where('factionId', '==', myFaction()).where('deleted', '==', false).limit(300);
    } else if (isStaff() && can('viewReports') && curatedFactions().length){
      q = q.where('factionId', 'in', curatedFactions().slice(0, 30)).where('deleted', '==', false).limit(300);
    } else {
      _reports = [];
      renderReports();
      return;
    }
    const snap = await q.get();
    const batch = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isSiteAdmin()){
      _reportsCursor = snap.docs[snap.docs.length - 1] || _reportsCursor;
      _reportsHasMore = snap.docs.length === REPORTS_PAGE;
      _reports = more ? _reports.concat(batch) : batch;
    } else {
      _reports = batch;
      _reportsHasMore = false;
    }
    if (sortClient) _reports.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    renderReports();
  } catch (err){
    console.error('Отчёты', err);
    list.innerHTML = errorState('Не удалось загрузить отчёты. ' + humanError(err), 'retry-reports');
  }
}

function renderReports(){
  const list = document.getElementById('reportsList');
  const f = document.getElementById('reportFilterFaction').value;
  const start = document.getElementById('reportFilterStart').value;
  const end = document.getElementById('reportFilterEnd').value;
  document.getElementById('reportsDeletedWrap').hidden = !isSiteAdmin();

  let rows = _reports;
  if (!(isSiteAdmin() && state.reportsShowDeleted)) rows = rows.filter(r => !r.deleted);
  if (f) rows = rows.filter(r => r.factionId === f);
  if (start) rows = rows.filter(r => r.date >= start);
  if (end) rows = rows.filter(r => r.date <= end);

  document.getElementById('reportsCount').textContent = rows.length;
  if (!rows.length){
    list.innerHTML = emptyState(_reports.length ? 'Ничего не найдено по текущим фильтрам.' : 'Отчётов пока нет.');
    return;
  }

  const canEditOwn = isLeader() && state.user.reportEditingEnabled === true;
  list.innerHTML = rows.map(r => `
    <div class="report-item${r.deleted ? ' is-deleted' : ''}">
      <div class="r-top">
        <div>
          <div class="r-name">${escapeHtml(r.leaderName)} — ${escapeHtml(r.factionName || factionName(r.factionId))}</div>
          <div class="r-meta">${fmtISO(r.date)}${(isSiteAdmin() || isStaff()) && r.authorEmail ? ' · ' + escapeHtml(r.authorNickname || r.authorEmail) : ''}${r.updatedAt && r.editedAt ? ' · изменён ' + fmtDateTime(r.editedAt) : ''}</div>
        </div>
        <div class="r-actions">
          ${canEditOwn && r.authorId === state.user.uid && !r.deleted ? `<button class="btn btn-ghost btn-sm" data-action="report-edit" data-id="${escapeHtml(r.id)}">Изменить комментарий</button>` : ''}
          ${isSiteAdmin() ? `<button class="btn btn-ghost btn-sm" data-action="versions" data-type="reports" data-id="${escapeHtml(r.id)}">История</button>` : ''}
          ${canDeleteReport(r) && !r.deleted ? `<button class="btn btn-ghost btn-sm danger-text" data-action="report-delete" data-id="${escapeHtml(r.id)}">Удалить</button>` : ''}
          ${isSiteAdmin() && r.deleted ? `<button class="btn btn-ghost btn-sm" data-action="report-restore" data-id="${escapeHtml(r.id)}">Восстановить</button><button class="btn btn-ghost btn-sm danger-text" data-action="purge" data-type="reports" data-id="${escapeHtml(r.id)}">Удалить навсегда</button>` : ''}
        </div>
      </div>
      ${r.problems ? `<div class="r-field"><b>Проблемы:</b> ${escapeHtml(r.problems)}</div>` : ''}
      ${r.improvements ? `<div class="r-field"><b>Улучшения:</b> ${escapeHtml(r.improvements)}</div>` : ''}
      ${r.comment ? `<div class="r-field"><b>Комментарий:</b> ${escapeHtml(r.comment)}</div>` : ''}
      ${r.deleted ? `<div class="r-field deleted-note">Удалён ${fmtDateTime(r.deletedAt)}${r.deletedByEmail ? ' · ' + escapeHtml(r.deletedByEmail) : ''}${r.deleteReason ? ' · ' + escapeHtml(r.deleteReason) : ''}</div>` : ''}
    </div>`).join('') + (isSiteAdmin() && _reportsHasMore && !f && !start && !end ? `<button class="btn btn-block" data-action="reports-more">Загрузить ещё</button>` : '');
}

function initReportForm(){
  const locked = document.getElementById('reportsLocked');
  const body = document.getElementById('reportsBody');
  if (!canViewReports()){
    locked.hidden = false;
    body.hidden = true;
    locked.innerHTML = isSignedIn()
      ? emptyState('У вас нет доступа к отчётам. Доступ выдаёт администратор сайта.')
      : lockedState('Войдите, чтобы открыть раздел отчётов.');
    return;
  }
  locked.hidden = true;
  body.hidden = false;

  const form = document.querySelector('#panel-reports .form-card');
  form.hidden = !canCreateReports();
  document.querySelector('#panel-reports .report-layout').classList.toggle('single', !canCreateReports());
  const select = document.getElementById('reportFaction');
  const filter = document.getElementById('reportFilterFaction');
  const ids = reportFactionIds();
  const viewIds = isSiteAdmin() ? state.factions.map(f => f.id) : ids;
  filter.innerHTML = `<option value="">Все доступные</option>` + factionOptionsHtml(viewIds, '');
  if (!document.getElementById('reportDate').value) document.getElementById('reportDate').value = todayISO();

  if (isLeader()){
    document.getElementById('reportFormTitle').textContent = `Новый отчёт — ${factionName(myFaction())}`;
    select.innerHTML = factionOptionsHtml([myFaction()], myFaction());
    select.disabled = true;
    document.getElementById('reportName').value = state.user.displayName || '';
  } else {
    document.getElementById('reportFormTitle').textContent = 'Новый отчёт';
    select.innerHTML = ids.length ? factionOptionsHtml(ids, select.value) : '<option value="">Нет доступных фракций</option>';
    select.disabled = !ids.length;
    updateReportLeaderName();
  }
}

function updateReportLeaderName(){
  if (isLeader()) return;
  const id = document.getElementById('reportFaction').value;
  const f = state.factionsById[id];
  const entry = f && f.forumKey && state.forum ? state.forum[f.forumKey] : null;
  const nick = entry && entry.nickname && entry.nickname !== '-' ? entry.nickname : '';
  document.getElementById('reportName').value = nick;
}

async function saveReport(){
  const btn = document.getElementById('saveReportBtn');
  const factionId = isLeader() ? myFaction() : document.getElementById('reportFaction').value;
  const leaderName = document.getElementById('reportName').value.trim();
  const date = document.getElementById('reportDate').value;
  const problems = document.getElementById('reportProblems').value.trim();
  const improvements = document.getElementById('reportImprovements').value.trim();
  const comment = document.getElementById('reportComment').value.trim();
  if (!factionId || !leaderName || !date){ toast('Заполните фракцию, имя лидера и дату', 'error'); return; }
  if (!reportFactionIds().includes(factionId)){ toast('У вас нет прав создавать отчёт для этой фракции', 'error'); return; }
  setLoading(btn, true);
  try {
    const f = state.factionsById[factionId];
    await db.collection('reports').add({
      factionId,
      factionName: f ? f.name : factionId,
      side: factionSide(f),
      leaderName,
      date,
      problems,
      improvements,
      comment,
      authorId: state.user.uid,
      authorEmail: state.user.email,
      authorNickname: state.user.displayName || '',
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    ['reportProblems', 'reportImprovements', 'reportComment'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('reportDate').value = todayISO();
    toast('Отчёт сохранён');
    loadReports();
  } catch (err){
    failToast(err, 'Не удалось сохранить отчёт');
  } finally {
    setLoading(btn, false);
  }
}

function openReportEditModal(id){
  const r = _reports.find(x => x.id === id);
  if (!r) return;
  openModal(`
    <h2>Изменить комментарий</h2>
    <p class="sub">${escapeHtml(r.factionName)} · ${fmtISO(r.date)}</p>
    <div class="field"><label for="rEditComment">Дополнительный комментарий</label><textarea id="rEditComment" rows="5" maxlength="4000">${escapeHtml(r.comment || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="rEditSaveBtn" data-action="report-edit-save" data-id="${escapeHtml(id)}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
}

async function saveReportComment(id){
  const btn = document.getElementById('rEditSaveBtn');
  const comment = document.getElementById('rEditComment').value.trim();
  setLoading(btn, true);
  try {
    await db.collection('reports').doc(id).update({ comment, editedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    closeModal();
    toast('Комментарий обновлён');
    loadReports();
  } catch (err){
    failToast(err, 'Не удалось изменить комментарий');
  } finally {
    setLoading(btn, false);
  }
}

async function deleteReport(id){
  const r = _reports.find(x => x.id === id);
  if (!r || !canDeleteReport(r)) return;
  const res = await confirmDialog({ title: 'Удалить отчёт?', text: `${r.leaderName} — ${r.factionName}, ${fmtISO(r.date)}. Отчёт скроется из списка, но его можно будет восстановить.`, okText: 'Удалить', reason: true });
  if (!res) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'report', id, stripSystem(r));
    batch.update(db.collection('reports').doc(id), {
      deleted: true, deletedAt: FieldValue.serverTimestamp(), deletedBy: state.user.uid, deletedByEmail: state.user.email, deleteReason: res.reason, updatedAt: FieldValue.serverTimestamp()
    });
    addAudit(batch, { action: 'Удалил отчёт', objectType: 'report', objectId: id, oldValue: { leaderName: r.leaderName, date: r.date }, additionalInfo: res.reason, faction: r.factionId });
    await batch.commit();
    toast('Отчёт удалён');
    loadReports();
  } catch (err){
    failToast(err, 'Не удалось удалить отчёт');
  }
}

async function restoreReport(id){
  const r = _reports.find(x => x.id === id);
  if (!r) return;
  const ok = await confirmDialog({ title: 'Восстановить отчёт?', text: `${r.leaderName} — ${r.factionName}, ${fmtISO(r.date)}.`, okText: 'Восстановить', danger: false });
  if (!ok) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'report', id, stripSystem(r));
    batch.update(db.collection('reports').doc(id), { deleted: false, restoredAt: FieldValue.serverTimestamp(), restoredBy: state.user.uid, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: 'Восстановил удалённый отчёт', objectType: 'report', objectId: id, newValue: { leaderName: r.leaderName, date: r.date }, faction: r.factionId });
    await batch.commit();
    toast('Отчёт восстановлен');
    loadReports();
  } catch (err){
    failToast(err, 'Не удалось восстановить отчёт');
  }
}
