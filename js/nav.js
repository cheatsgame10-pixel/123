const NAV_GROUPS = [
  { title: 'Основное', items: [
    { id: 'dashboard', label: 'Главная', icon: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>' },
    { id: 'leaders', label: 'Список лидеров', icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/>' },
    { id: 'archive', label: 'Архив лидеров', icon: '<path d="M3 7h18v13H3z"/><path d="M5 4h14v3H5z"/><path d="M10 12h4"/>' },
    { id: 'news', label: 'Новости', icon: '<path d="M4 5h13v14H4z"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M7 9h7M7 12h7M7 15h5"/>' }
  ]},
  { title: 'Работа', items: [
    { id: 'reports', label: 'Отчёты', icon: '<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6"/><path d="M9 13h7M9 17h7"/>' },
    { id: 'duties', label: 'Обязанности', icon: '<path d="M9 5h6l1 2h3v14H5V7h3z"/><path d="m9 13 2 2 4-4"/>' },
    { id: 'nickcheck', label: 'Проверка ников', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' }
  ]},
  { title: 'Администрирование', items: [
    { id: 'pending', label: 'Доступ', icon: '<path d="M12 2v4M12 22v-4M4 12H2M6 12H4M20 12h-2M22 12h-2M19.07 4.93l-2.83 2.83M4.93 19.07l2.83-2.83M19.07 19.07l-2.83-2.83M4.93 4.93l2.83 2.83"/>' },
    { id: 'users', label: 'Пользователи', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' },
    { id: 'factions', label: 'Фракции', icon: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>' },
    { id: 'audit', label: 'Журнал действий', icon: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>' },
    { id: 'recovery', label: 'Восстановление', icon: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>' }
  ]}
];

function navIcon(path){
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function renderSidebar(){
  const el = document.getElementById('sidebar');
  const u = state.user;
  const groups = NAV_GROUPS.map(g => ({ title: g.title, items: g.items.filter(i => canAccessTab(i.id)) })).filter(g => g.items.length);
  let meExtra = '';
  if (u) {
    if (isLeader()) {
      meExtra += `<div class="me-faction"><span class="faction-badge">${escapeHtml(factionName(u.faction))}</span></div>`;
    }
    if (isStaff() && curatedFactions().length) {
      const badges = curatedFactions().map(f => `<span class="faction-badge">${escapeHtml(factionName(f))}</span>`).join(' ');
      meExtra += `<div class="me-factions">${badges}</div>`;
    }
  }
  el.innerHTML = `
    <div class="brand" data-tab="${isSignedIn() ? 'dashboard' : 'leaders'}" role="button" tabindex="0">
      <div class="brand-text">GTA5RP <span>HUB</span></div>
    </div>
    <nav class="nav">
      ${groups.map(g => `
        <div class="nav-group">
          <div class="nav-group-title">${g.title}</div>
          ${g.items.map(i => `<button class="nav-item${state.tab === i.id ? ' active' : ''}" data-tab="${i.id}">${navIcon(i.icon)}<span>${i.label}</span></button>`).join('')}
        </div>`).join('')}
    </nav>
    <div class="sidebar-foot">
      ${u ? `
        <div class="me-card">
          <div class="me-meta">
            <div class="me-name">${escapeHtml(u.displayName || u.email)}</div>
            <div class="me-role">
              ${roleBadge(u)}
              ${(isStaff() || isSiteAdmin()) ? levelBadge(u.serverLevel) : ''}
            </div>
            ${meExtra}
          </div>
          <span class="me-dot" title="В сети"></span>
        </div>
        <button class="btn btn-ghost btn-block" data-action="logout">Выйти</button>`
      : `<button class="btn btn-primary btn-block" data-action="login">Войти через Google</button>
         <div class="guest-note">Без входа доступны лидеры и архив</div>`}
    </div>`;
}

function renderTopbar(){
  const right = document.getElementById('topbarRight');
  right.innerHTML = `
    <button class="btn btn-icon support-btn" id="supportTopBtn" title="Поддержка">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 8v.01M12 11v.01"/></svg>
      <span id="supportUnreadBadge" class="support-badge" hidden>0</span>
    </button>
  `;
  document.getElementById('supportTopBtn')?.addEventListener('click', openSupportModal);
  if (isSiteAdmin()) {
    updateUnreadBadge();
  }
}

function setPageTitle(tab){
  document.getElementById('pageTitle').textContent = TAB_TITLES[tab] || 'GTA5RP HUB';
}

function toggleSidebar(force){
  const open = typeof force === 'boolean' ? force : document.body.classList.contains('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed', !open);
}

function updateDateTime(){
  const el = document.getElementById('topbarDateTime');
  if (!el) return;
  const now = getMoscowNow();
  const dateStr = now.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long'
  }).replace(/^./, c => c.toUpperCase());
  const timeStr = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const tz = 'МСК';
  el.innerHTML = `
    <span class="topbar-date">${dateStr}</span>
    <span class="topbar-time">${timeStr}</span>
    <span class="topbar-tz">${tz}</span>
  `;
}

let _dateTimeInterval = null;
function startDateTimeUpdater(){
  updateDateTime();
  if (_dateTimeInterval) clearInterval(_dateTimeInterval);
  _dateTimeInterval = setInterval(updateDateTime, 60000);
}
