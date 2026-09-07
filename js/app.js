let _forumTimer = null;
let _booted = false;

const TAB_LOADERS = {
  dashboard: () => renderDashboard(),
  leaders: () => { renderLeaders(); fetchForum(false); },
  archive: () => loadArchive(),
  news: () => loadNews(),
  reports: () => { initReportForm(); if (canViewReports()) loadReports(); },
  duties: () => loadDuties(),
  nickcheck: () => renderNickcheck(),
  pending: () => loadPendingUsers(),
  users: () => loadUsers(),
  factions: () => renderFactionsSection(),
  audit: () => loadAudit(false),
  recovery: () => loadRecovery()
};

function switchTab(tab){
  if (!canAccessTab(tab)){
    toast(isSignedIn() ? 'У вас нет доступа к этому разделу' : 'Войдите, чтобы открыть этот раздел', 'error');
    tab = isSignedIn() ? 'dashboard' : 'leaders';
  }
  if (tab === 'profile') tab = isSignedIn() ? 'dashboard' : 'leaders';
  const changed = state.tab !== tab;
  state.tab = tab;
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
  document.querySelectorAll('#sidebar .nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  setPageTitle(tab);
  window.scrollTo({ top: 0 });
  if (TAB_LOADERS[tab]) TAB_LOADERS[tab]();
  if (changed) visitPage(tab);
}

async function onSessionChanged(full){
  renderSidebar();
  renderTopbar();
  if (!_booted) return;
  if (typeof initGlobalSupportUnreadListener === 'function') initGlobalSupportUnreadListener();
  await loadLeaderUsers();
  if (full){
    endVisit();
    state.visitId = null;
    startVisit();
  }
  if (!state.tab || !canAccessTab(state.tab) || full) switchTab(isSignedIn() ? 'dashboard' : 'leaders');
  else switchTab(state.tab);
}

function handleAction(el){
  const a = el.dataset.action;
  const id = el.dataset.id;
  const type = el.dataset.type;
  const map = {
    'login': () => login(),
    'logout': () => logout(),
    'modal-close': () => { if (typeof stopSupportListeners === 'function') stopSupportListeners(); closeModal(); },
    'retry-forum': () => { renderLeadersSkeleton(); fetchForum(true); },
    'retry-archive': () => loadArchive(),
    'retry-reports': () => loadReports(),
    'retry-users': () => loadUsers(),
    'retry-news': () => loadNews(),
    'retry-duties': () => loadDuties(),
    'retry-audit': () => loadAudit(false),
    'retry-recovery': () => loadRecovery(),
    'archive-edit': () => openArchiveModal(id),
    'archive-save': () => saveArchive(id),
    'archive-delete': () => deleteArchive(id),
    'archive-restore': () => restoreArchive(id),
    'report-edit': () => openReportEditModal(id),
    'report-edit-save': () => saveReportComment(id),
    'report-delete': () => deleteReport(id),
    'report-restore': () => restoreReport(id),
    'report-curator-comment': () => openCuratorCommentModal(id),
    'report-curator-comment-save': () => saveCuratorComment(id),
    'report-mark-viewed': () => markReportViewed(id),
    'reports-more': () => loadReports(true),
    'user-edit': () => openUserModal(id),
    'user-save': () => saveUser(id),
    'user-revoke': () => revokeAdmin(id),
    'user-rename': () => openRenameModal(id),
    'user-rename-save': () => saveRename(id),
    'user-delete': () => deleteUser(id),
    'user-restore': () => restoreUser(id),
    'faction-create': () => openFactionModal(null),
    'faction-edit': () => openFactionModal(id),
    'faction-save': () => saveFaction(id || null),
    'sync-factions': () => syncFactionsFromForum(),
    'news-create': () => openNewsModal(null),
    'news-edit': () => openNewsModal(id),
    'news-save': () => saveNews(id || null),
    'news-delete': () => deleteNews(id),
    'duty-take': () => openDutyTakeModal(),
    'duty-take-save': () => saveDutyTake(),
    'duty-edit': () => openDutyEditModal(id),
    'duty-edit-save': () => saveDutyEdit(id),
    'duty-history': () => openDutyHistory(id),
    'duty-delete': () => deleteDuty(id),
    'duty-seed': () => seedDefaultDuties(),
    'duty-types': () => openDutyTypesModal(),
    'duty-type-add': () => addDutyType(),
    'duty-type-toggle': () => toggleDutyType(id),
    'duty-edit-template': () => openDutyTemplateModal(el.dataset.faction),
    'duty-template-save': () => saveDutyTemplate(el.dataset.id),
    'audit-more': () => loadAudit(true),
    'versions': () => openVersionsModal(type, id),
    'version-restore': () => restoreVersion(type, id, el.dataset.version),
    'recover': () => recoverRecord(type, id),
    'purge': () => purgeRecord(type, id),
    'support-open': () => openSupportModal()
  };
  if (map[a]) map[a]();
}

function bindEvents(){
  document.addEventListener('click', e => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl){ handleAction(actionEl); return; }
    const tabEl = e.target.closest('[data-tab]');
    if (tabEl){ switchTab(tabEl.dataset.tab); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (typeof stopSupportListeners === 'function') stopSupportListeners();
      closeConfirm(false);
      closeModal();
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-tab][role="button"]')){ e.preventDefault(); switchTab(e.target.dataset.tab); }
  });

  document.getElementById('menuBtn').addEventListener('click', () => toggleSidebar());
  document.getElementById('sidebarBackdrop').addEventListener('click', () => toggleSidebar(false));

  document.getElementById('leaderSearch').addEventListener('input', debounce(e => { state.search = e.target.value; renderLeaders(); }, 120));
  document.getElementById('statsRow').addEventListener('click', e => {
    const chip = e.target.closest('.stat-chip');
    if (!chip || chip.classList.contains('static')) return;
    const st = chip.dataset.status || null;
    state.statusFilter = state.statusFilter === st ? null : st;
    renderLeaders();
  });
  document.getElementById('refreshBtn').addEventListener('click', () => fetchForum(true));

  document.getElementById('archiveSearch').addEventListener('input', debounce(e => { state.archiveSearch = e.target.value; renderArchive(); }, 120));
  document.getElementById('archiveAddBtn').addEventListener('click', () => openArchiveModal(null));
  document.getElementById('archiveShowDeleted').addEventListener('change', e => { state.archiveShowDeleted = e.target.checked; loadArchive(); });

  document.getElementById('reportFaction').addEventListener('change', updateReportLeaderName);
  document.getElementById('saveReportBtn').addEventListener('click', saveReport);
  ['reportFilterFaction', 'reportFilterStart', 'reportFilterEnd'].forEach(id => document.getElementById(id).addEventListener('change', renderReports));
  document.getElementById('reportFilterReset').addEventListener('click', () => {
    ['reportFilterFaction', 'reportFilterStart', 'reportFilterEnd'].forEach(id => document.getElementById(id).value = '');
    renderReports();
  });
  document.getElementById('reportsShowDeleted').addEventListener('change', e => { state.reportsShowDeleted = e.target.checked; renderReports(); });

  document.getElementById('confirmOk').addEventListener('click', () => closeConfirm(true));
  document.getElementById('confirmCancel').addEventListener('click', () => closeConfirm(false));
  document.getElementById('confirmOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeConfirm(false); });
  document.getElementById('confirmReason').addEventListener('keydown', e => { if (e.key === 'Enter') closeConfirm(true); });
  document.getElementById('confirmTyped').addEventListener('keydown', e => { if (e.key === 'Enter') closeConfirm(true); });
  document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  window.addEventListener('offline', () => toast('Нет соединения с интернетом. Данные могут быть неактуальны.', 'error'));
  window.addEventListener('online', () => { toast('Соединение восстановлено'); fetchForum(false); });
  bindVisitLifecycle();

  window.addEventListener('resize', debounce(initSidebarState, 200));
}

function initSidebarState(){
  const isMobile = window.innerWidth <= 840;
  document.body.classList.toggle('sidebar-collapsed', isMobile);
}

async function boot(){
  bindEvents();
  renderSidebar();
  renderTopbar();
  initSidebarState();
  renderLeadersSkeleton();
  loadCachedForum();
  await loadFactions();
  subscribeToFactions();
  await new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(() => { unsub(); resolve(); });
  });
  if (auth.currentUser){
    await new Promise(resolve => {
      const started = Date.now();
      const check = () => { if (state.user || !state.authUser || Date.now() - started > 8000) resolve(); else setTimeout(check, 50); };
      check();
    });
  }
  _booted = true;
  if (typeof initGlobalSupportUnreadListener === 'function') initGlobalSupportUnreadListener();
  await loadLeaderUsers();
  renderSidebar();
  renderTopbar();
  if (state.forum) renderLeaders();
  switchTab(isSignedIn() ? 'dashboard' : 'leaders');
  startVisit();
  fetchForum(false);
  _forumTimer = setInterval(() => fetchForum(false), AUTO_REFRESH_MIN * 60 * 1000);
  startDateTimeUpdater();
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  boot();
});
