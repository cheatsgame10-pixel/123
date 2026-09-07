function isSignedIn(){
  return !!(state.user && state.user.active === true);
}

function role(){
  return state.user ? state.user.systemRole : null;
}

function myLevel(){
  return state.user ? Number(state.user.serverLevel) || 2 : 0;
}

function isSiteAdmin(){
  return isSignedIn() && role() === 'site_admin';
}

function isStaff(){
  return isSignedIn() && STAFF_ROLES.includes(role());
}

function isChiefOverseer(){
  return isSignedIn() && role() === 'chief_overseer';
}

function isLeader(){
  return isSignedIn() && role() === 'leader' && typeof state.user.faction === 'string' && state.user.faction.length > 0;
}

function myFaction(){
  return isLeader() ? state.user.faction : null;
}

function canEditDutyTasks(factionId) {
  if (isSiteAdmin()) return true;
  if (!isStaff() || !curates(factionId)) return false;
  if ((role() === 'curator' || role() === 'server_admin') && can('manageDuties')) return true;
  return can('editDutyTasks');
}

function curatedFactions(){
  if (isSiteAdmin()) return state.factions.filter(f => f.active !== false).map(f => f.id);
  if (isChiefOverseer() && state.user.direction) {
    const cats = DIRECTION_CATEGORIES[state.user.direction] || [];
    const excludedKeys = EXCLUDED_FORUM_KEYS || [];
    return state.factions
      .filter(f => f.active !== false && cats.includes(f.category))
      .filter(f => !excludedKeys.includes(f.forumKey))
      .map(f => f.id);
  }
  if (isStaff() && Array.isArray(state.user.curatedFactions)) {
    return state.user.curatedFactions.filter(id => state.factionsById[id] && state.factionsById[id].active !== false);
  }
  return [];
}

function can(perm){
  if (isSiteAdmin()) return true;
  return isStaff() && Array.isArray(state.user.permissions) && state.user.permissions.includes(perm);
}

function curates(factionId){
  if (isSiteAdmin()) return true;
  return curatedFactions().includes(factionId);
}

function canViewReports(){
  return isSiteAdmin() || isLeader() || (isStaff() && can('viewReports')) || isChiefOverseer();
}

function canCreateReports(){
  return isSiteAdmin() || isLeader();
}

function canDeleteReport(r){
  if (isSiteAdmin()) return true;
  return isStaff() && can('manageReports') && curates(r.factionId);
}

function reportFactionIds(){
  if (isSiteAdmin()) return state.factions.filter(f => f.active !== false).map(f => f.id);
  if (isLeader()) return [myFaction()];
  if (isStaff()) return curatedFactions();
  return [];
}

function canManageDuties(){
  return isSiteAdmin() || (isStaff() && can('manageDuties'));
}

function canViewDutyStats() {
  return canManageDuties();
}

function canViewDutyArchiveStats() {
  if (isSiteAdmin()) return true;
  if (isChiefOverseer()) return true;
  if (isStaff() && myLevel() >= 6) return true;
  if (role() === 'curator') return true;
  return false;
}

function canManageDutyTemplates(factionId) {
  if (isSiteAdmin()) return true;
  if (!isStaff() || !curates(factionId)) return false;
  return role() === 'curator' || role() === 'server_admin';
}

function isManager(){
  return isSiteAdmin() || (isStaff() && myLevel() >= 4);
}

function isChief(){
  return isSiteAdmin() || (isStaff() && myLevel() >= 6);
}

function manageableLevels(){
  if (isSiteAdmin()) return [2, 3, 4, 5, 6];
  if (!isStaff()) return [];
  if (myLevel() === 4) return [2, 3];
  if (myLevel() === 5) return [2, 3, 4];
  if (myLevel() >= 6) return [2, 3, 4, 5, 6];
  return [];
}

function canManageCurationOf(u){
  if (!u || u.uid === state.user?.uid) return false;
  if (isSiteAdmin()) return true;
  if (u.systemRole === 'site_admin') return false;
  return isStaff() && manageableLevels().includes(Number(u.serverLevel));
}

function canChangeLevelOf(u){
  if (!u || u.uid === state.user?.uid) return false;
  if (isSiteAdmin()) return true;
  return isStaff() && myLevel() >= 6 && u.systemRole !== 'site_admin';
}

function assignableFactionIds(){
  if (isSiteAdmin() || myLevel() >= 5) return state.factions.filter(f => f.active !== false).map(f => f.id);
  return curatedFactions();
}

function canAccessTab(tab){
  switch (tab){
    case 'leaders':
    case 'archive':
      return true;
    case 'dashboard':
    case 'news':
    case 'support':
      return isSignedIn();
    case 'reports':
      return canViewReports();
    case 'duties':
      return canManageDuties();
    case 'pending':
      return isSiteAdmin();
    case 'users':
      return isSiteAdmin() || isStaff();
    case 'factions':
    case 'recovery':
      return isSiteAdmin();
    case 'audit':
      return isSiteAdmin() || can('viewAudit') || isChiefOverseer();
    default:
      return false;
  }
}

function roleLabel(u){
  if (!u) return 'Гость';
  return ROLES[u.systemRole] || 'Без роли';
}

function levelLabel(n){
  return LEVELS[n] || 'Уровень не задан';
}

function levelBadge(n){
  return `<span class="level-badge" data-level="${Number(n) || 2}">${escapeHtml(levelLabel(n))}</span>`;
}

function roleBadge(u){
  return `<span class="role-badge${u && u.systemRole === 'site_admin' ? ' role-admin' : ''}">${escapeHtml(roleLabel(u))}</span>`;
}

function describeUser(u){
  if (!u) return 'Гость';
  const base = roleLabel(u);
  if (u.systemRole === 'leader' && u.faction) return `${base} ${factionName(u.faction)}`;
  if (u.systemRole === 'chief_overseer' && u.direction) return `${base} (${OVERSEER_DIRECTION_LABELS[u.direction] || u.direction})`;
  if (STAFF_ROLES.includes(u.systemRole) && Array.isArray(u.curatedFactions) && u.curatedFactions.length) return `${base} ${u.curatedFactions.map(factionName).join(', ')}`;
  return base;
}
