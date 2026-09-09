let _forumTimer = null;
let _booted = false;


function stopAuthenticatedRealtimeListeners(){
  try { if (typeof stopGlobalSupportUnreadListener === 'function') stopGlobalSupportUnreadListener(); } catch (_) {}
  try { if (typeof stopSupportListeners === 'function') stopSupportListeners(); } catch (_) {}
  try { if (typeof stopDashboardRealtime === 'function') stopDashboardRealtime(); } catch (_) {}
  try { if (typeof stopPresence === 'function') stopPresence(); } catch (_) {}
  try { if (typeof stopUsersSyncJobListener === 'function') stopUsersSyncJobListener(); } catch (_) {}
  try { if (typeof _leaderUsersUnsub !== 'undefined' && _leaderUsersUnsub) { _leaderUsersUnsub(); _leaderUsersUnsub = null; } } catch (_) {}
  try { if (typeof _newsUnsub !== 'undefined' && _newsUnsub) { _newsUnsub(); _newsUnsub = null; } } catch (_) {}
  try { if (typeof _auditUnsub !== 'undefined' && _auditUnsub) { _auditUnsub(); _auditUnsub = null; } } catch (_) {}
  try { if (typeof _usersUnsub !== 'undefined' && _usersUnsub) { _usersUnsub(); _usersUnsub = null; } } catch (_) {}
  try { if (typeof _pendingUsersUnsub !== 'undefined' && _pendingUsersUnsub) { _pendingUsersUnsub(); _pendingUsersUnsub = null; } } catch (_) {}
  try { if (typeof _usersPresenceUnsub !== 'undefined' && _usersPresenceUnsub) { _usersPresenceUnsub(); _usersPresenceUnsub = null; } } catch (_) {}
  try {
    if (typeof _unsubscribers !== 'undefined') { _unsubscribers.forEach(unsub => { try { unsub(); } catch (_) {} }); _unsubscribers = []; }
    if (typeof _curatorUsersUnsub !== 'undefined' && _curatorUsersUnsub) { _curatorUsersUnsub(); _curatorUsersUnsub = null; }
    if (typeof _dutyTemplatesUnsub !== 'undefined' && _dutyTemplatesUnsub) { _dutyTemplatesUnsub(); _dutyTemplatesUnsub = null; }
    if (typeof _dutyTaskPoolUnsub !== 'undefined' && _dutyTaskPoolUnsub) { _dutyTaskPoolUnsub(); _dutyTaskPoolUnsub = null; }
    if (typeof _dutyStatsUnsub !== 'undefined' && _dutyStatsUnsub) { _dutyStatsUnsub(); _dutyStatsUnsub = null; }
  } catch (_) {}
  try { if (typeof _recoveryUnsubs !== 'undefined') { _recoveryUnsubs.forEach(unsub => { try { unsub(); } catch (_) {} }); _recoveryUnsubs = []; } } catch (_) {}
}
const TAB_LOADERS = {
  dashboard: () => renderDashboard(),
  leaders: () => { renderLeaders(); fetchForum(false); },
  archive: () => loadArchive(),
  news: () => loadNews(),
  duties: () => loadDuties(),
  'faction-checks': () => loadFactionChecks(),
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
  const previousTab = state.tab;
  const changed = previousTab !== tab;
  if (previousTab === 'dashboard' && tab !== 'dashboard' && typeof stopDashboardRealtime === 'function') stopDashboardRealtime();
  state.tab = tab;
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
  document.querySelectorAll('#sidebar .nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (changed || tab === 'duties') renderSidebar();
  setPageTitle(tab);
  window.scrollTo({ top: 0 });
  if (TAB_LOADERS[tab]) TAB_LOADERS[tab]();
  if (changed) visitPage(tab);
}

function syncGuestView(){
  const signedIn = isSignedIn();
  const gate = document.getElementById('guestGate');
  const shell = document.querySelector('.shell');
  if (gate) gate.hidden = signedIn;
  if (shell) shell.hidden = !signedIn;
  document.body.classList.toggle('guest-mode', !signedIn);
}

async function onSessionChanged(full){
  if (!isSignedIn()) stopAuthenticatedRealtimeListeners();
  initTheme();
  syncGuestView();
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
    'login': () => login().catch(()=>{}),
    'logout': () => confirmLogout(),
    'users-sync': () => syncAllUsersFromDiscord(),
    'discord-refresh': () => login().catch(()=>{}),
    'users-sync-cancel': () => cancelUsersDiscordSync(),
    'modal-close': () => { if (typeof stopSupportListeners === 'function') stopSupportListeners(); closeModal(); },
    'retry-forum': () => { renderLeadersSkeleton(); fetchForum(true); },
    'retry-archive': () => loadArchive(),
    'retry-users': () => loadUsers(),
    'retry-news': () => loadNews(),
    'retry-duties': () => loadDuties(),
    'retry-audit': () => loadAudit(false),
    'retry-recovery': () => loadRecovery(),
    'archive-edit': () => openArchiveModal(id),
    'archive-save': () => saveArchive(id),
    'archive-delete': () => deleteArchive(id),
    'archive-restore': () => restoreArchive(id),
    'user-edit': () => openUserModal(id),
    'user-save': () => saveUser(id),
    'user-revoke': () => revokeAdmin(id),
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
    const dropdownDisplay = e.target.closest('.dropdown-display');
    if (dropdownDisplay) {
      const currentOptions = dropdownDisplay.parentElement?.querySelector(':scope > .dropdown-options') || null;
      closeAllDropdowns(currentOptions);
    } else if (!e.target.closest('.custom-dropdown') && !e.target.closest('.theme-control')) {
      closeAllDropdowns();
    }

    const actionEl = e.target.closest('[data-action]');
    if (actionEl){ handleAction(actionEl); return; }

    const dutySub = e.target.closest('[data-duty-subtab]');
    if (dutySub) {
      _dutySubTab = dutySub.dataset.dutySubtab === 'stats' ? 'stats' : 'duties';
      switchTab('duties');
      renderSidebar();
      if (window.innerWidth <= 840) toggleSidebar(false);
      return;
    }

    const factionCheckSub = e.target.closest('[data-faction-check-subtab]');
    if (factionCheckSub) {
      _factionCheckSubTab = factionCheckSub.dataset.factionCheckSubtab === 'nicknames' ? 'nicknames' : 'pgf';
      switchTab('faction-checks');
      renderSidebar();
      if (window.innerWidth <= 840) toggleSidebar(false);
      return;
    }

    const tabEl = e.target.closest('[data-tab]');
    if (tabEl){
      switchTab(tabEl.dataset.tab);
      if (window.innerWidth <= 840 && tabEl.dataset.tab !== 'duties') toggleSidebar(false);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (typeof stopSupportListeners === 'function') stopSupportListeners();
      closeConfirm(false);
      closeModal();
      if (window.innerWidth <= 840) toggleSidebar(false);
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


  document.getElementById('confirmOk').addEventListener('click', () => closeConfirm(true));
  document.getElementById('confirmCancel').addEventListener('click', () => closeConfirm(false));
  document.getElementById('confirmOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeConfirm(false); });
  document.getElementById('confirmReason').addEventListener('keydown', e => { if (e.key === 'Enter') closeConfirm(true); });
  document.getElementById('confirmTyped').addEventListener('keydown', e => { if (e.key === 'Enter') closeConfirm(true); });
  document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) { if (typeof stopSupportListeners === 'function' && document.querySelector('.modal.support-modal')) stopSupportListeners(); closeModal(); } });

  window.addEventListener('offline', () => toast('Нет соединения с интернетом. Данные могут быть неактуальны.', 'error'));
  window.addEventListener('online', () => { toast('Соединение восстановлено'); fetchForum(false); });
  bindVisitLifecycle();

  window.addEventListener('resize', debounce(initSidebarState, 200));
}

function initSidebarState(){
  const isMobile = window.innerWidth <= 840;
  document.body.classList.toggle('sidebar-collapsed', isMobile);
  document.body.classList.remove('sidebar-mobile-open');
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', String(!isMobile));
}

async function boot(){
  bindEvents();
  initTheme();
  syncGuestView();
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
