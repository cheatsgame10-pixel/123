let _reports = [];
let _reportsCursor = null;
let _reportsHasMore = false;
const REPORTS_PAGE = 50;

async function loadReports(more){
  const list = document.getElementById('reportsList');
  if (!more){ _reports = []; _reportsCursor = null; list.innerHTML = skeletonRows(4); }
  try {
    let q = db.collection('reports');
    if (isSiteAdmin()){
      q = q.orderBy('createdAt', 'desc').limit(REPORTS_PAGE);
      if (_reportsCursor) q = q.startAfter(_reportsCursor);
    } else if (isLeader()){
      q = q.where('factionId', '==', myFaction()).where('deleted', '==', false).orderBy('createdAt', 'desc').limit(REPORTS_PAGE);
      if (_reportsCursor) q = q.startAfter(_reportsCursor);
    } else if (isStaff() && can('viewReports') && curatedFactions().length){
      q = q.where('factionId', 'in', curatedFactions().slice(0, 30)).where('deleted', '==', false).orderBy('createdAt', 'desc').limit(REPORTS_PAGE);
      if (_reportsCursor) q = q.startAfter(_reportsCursor);
    } else {
      _reports = [];
      renderReports();
      return;
    }
    const snap = await q.get();
    const batch = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isSiteAdmin() || isLeader() || (isStaff() && can('viewReports'))){
      _reportsCursor = snap.docs[snap.docs.length - 1] || _reportsCursor;
      _reportsHasMore = snap.docs.length === REPORTS_PAGE;
      _reports = more ? _reports.concat(batch) : batch;
    } else {
      _reports = batch;
      _reportsHasMore = false;
    }
    renderReports();
  } catch (err){
    console.error('Отчёты', err);
    list.innerHTML = errorState('Не удалось загрузить отчёты. ' + humanError(err), 'retry-reports');
  }
}

function renderReports(){
  const list = document.getElementById('reportsList');
  const f = document.getElementById('reportFilterFaction')?.value || '';
  const start = document.getElementById('reportFilterStart')?.value || '';
  const end = document.getElementById('reportFilterEnd')?.value || '';
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
  const isAdmin = isSiteAdmin();
  const isStaffUser = isStaff();

  list.innerHTML = rows.map(r => `
    <div class="report-item${r.deleted ? ' is-deleted' : ''}">
      <div class="r-top">
        <div>
          <div class="r-name">${escapeHtml(r.leaderName)} — ${escapeHtml(r.factionName || factionName(r.factionId))}</div>
          <div class="r-meta">${fmtISO(r.date)}${(isAdmin || isStaffUser) && r.authorEmail ? ' · ' + escapeHtml(r.authorNickname || r.authorEmail) : ''}${r.updatedAt && r.editedAt ? ' · изменён ' + fmtDateTime(r.editedAt) : ''}</div>
        </div>
        <div class="r-actions">
          ${canEditOwn && r.authorId === state.user.uid && !r.deleted ? `<button class="btn btn-ghost btn-sm" data-action="report-edit" data-id="${escapeHtml(r.id)}">Изменить комментарий</button>` : ''}
          ${isAdmin ? `<button class="btn btn-ghost btn-sm" data-action="versions" data-type="reports" data-id="${escapeHtml(r.id)}">История</button>` : ''}
          ${isAdmin && !r.deleted ? `<button class="btn btn-ghost btn-sm danger-text" data-action="report-delete" data-id="${escapeHtml(r.id)}">Удалить</button>` : ''}
          ${isAdmin && r.deleted ? `<button class="btn btn-ghost btn-sm" data-action="report-restore" data-id="${escapeHtml(r.id)}">Восстановить</button><button class="btn btn-ghost btn-sm danger-text" data-action="purge" data-type="reports" data-id="${escapeHtml(r.id)}">Удалить навсегда</button>` : ''}
          ${isStaffUser && curates(r.factionId) && !r.deleted ? `<button class="btn btn-ghost btn-sm" data-action="report-curator-comment" data-id="${escapeHtml(r.id)}">Комментарий куратора</button>` : ''}
          ${isStaffUser && curates(r.factionId) && !r.deleted && !r.viewedByCurator ? `<button class="btn btn-ghost btn-sm" data-action="report-mark-viewed" data-id="${escapeHtml(r.id)}">Отметить просмотренным</button>` : ''}
        </div>
      </div>
      ${r.problems ? `<div class="r-field"><b>Проблемы:</b> ${escapeHtml(r.problems)}</div>` : ''}
      ${r.improvements ? `<div class="r-field"><b>Улучшения:</b> ${escapeHtml(r.improvements)}</div>` : ''}
      ${r.comment ? `<div class="r-field"><b>Комментарий лидера:</b> ${escapeHtml(r.comment)}</div>` : ''}
      ${r.curatorComment ? `<div class="r-field admin-reply"><b>Комментарий куратора:</b> ${escapeHtml(r.curatorComment)}</div>` : ''}
      ${r.viewedByCurator ? `<div class="r-field"><span class="badge badge-green">Просмотрен куратором</span> ${r.viewedAt ? fmtDateTime(r.viewedAt) : ''}</div>` : ''}
      ${r.deleted ? `<div class="r-field deleted-note">Удалён ${fmtDateTime(r.deletedAt)}${r.deletedByEmail ? ' · ' + escapeHtml(r.deletedByEmail) : ''}${r.deleteReason ? ' · ' + escapeHtml(r.deleteReason) : ''}</div>` : ''}
    </div>`).join('') + (isAdmin && _reportsHasMore && !f && !start && !end ? `<button class="btn btn-block" data-action="reports-more">Загрузить ещё</button>` : '');
}

function initReportForm(){
  const locked = document.getElementById('reportsLocked');
  const body = document.getElementById('reportsBody');
  if (!canViewReports()){
    locked.hidden = false;
    body.hidden = true;
    locked.innerHTML = isSignedIn()
      ? emptyState('У вас нет доступа к отчётам.')
      : lockedState('Войдите, чтобы открыть раздел отчётов.');
    return;
  }
  locked.hidden = true;
  body.hidden = false;

  const form = document.querySelector('#panel-reports .form-card');
  const isLeaderUser = isLeader();
  form.hidden = !isLeaderUser;
  document.querySelector('#panel-reports .report-layout').classList.toggle('single', !isLeaderUser);

  const select = document.getElementById('reportFaction');
  const filter = document.getElementById('reportFilterFaction');
  const ids = reportFactionIds();
  const viewIds = isSiteAdmin() ? state.factions.map(f => f.id) : ids;
  filter.innerHTML = `<option value="">Все доступные</option>` + factionOptionsHtml(viewIds, '');
  if (!document.getElementById('reportDate').value) document.getElementById('reportDate').value = todayISO();

  if (isLeaderUser){
    document.getElementById('reportFormTitle').textContent = `Новый отчёт — ${factionName(myFaction())}`;
    select.innerHTML = factionOptionsHtml([myFaction()], myFaction());
    select.disabled = true;
    document.getElementById('reportName').value = state.user.displayName || '';
  } else {
    select.innerHTML = '';
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
  if (!isLeader()) return;
  const btn = document.getElementById('saveReportBtn');
  const factionId = myFaction();
  const leaderName = document.getElementById('reportName').value.trim();
  const date = document.getElementById('reportDate').value;
  const problems = document.getElementById('reportProblems').value.trim();
  const improvements = document.getElementById('reportImprovements').value.trim();
  const comment = document.getElementById('reportComment').value.trim();
  if (!factionId || !leaderName || !date){ toast('Заполните фракцию, имя лидера и дату', 'error'); return; }
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
  if (!isLeader()) return;
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

function openCuratorCommentModal(id){
  const r = _reports.find(x => x.id === id);
  if (!r) return;
  openModal(`
    <h2>Комментарий куратора</h2>
    <p class="sub">${escapeHtml(r.factionName)} · ${fmtISO(r.date)}</p>
    <div class="field"><label for="curatorCommentText">Комментарий</label><textarea id="curatorCommentText" rows="5" maxlength="4000">${escapeHtml(r.curatorComment || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="curatorCommentSaveBtn" data-action="report-curator-comment-save" data-id="${escapeHtml(id)}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
}

async function saveCuratorComment(id){
  if (!isStaff() || !curates(_reports.find(x => x.id === id)?.factionId)) return;
  const btn = document.getElementById('curatorCommentSaveBtn');
  const comment = document.getElementById('curatorCommentText').value.trim();
  setLoading(btn, true);
  try {
    await db.collection('reports').doc(id).update({
      curatorComment: comment,
      curatorId: state.user.uid,
      curatorName: state.user.displayName || state.user.email,
      curatorCommentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    closeModal();
    toast('Комментарий сохранён');
    loadReports();
  } catch (err){
    failToast(err, 'Не удалось сохранить комментарий');
  } finally {
    setLoading(btn, false);
  }
}

async function markReportViewed(id){
  if (!isStaff() || !curates(_reports.find(x => x.id === id)?.factionId)) return;
  try {
    await db.collection('reports').doc(id).update({
      viewedByCurator: true,
      viewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    toast('Отчёт отмечен просмотренным');
    loadReports();
  } catch (err){
    failToast(err, 'Не удалось отметить отчёт');
  }
}

async function deleteReport(id){
  const r = _reports.find(x => x.id === id);
  if (!r || !isSiteAdmin()) return;
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
