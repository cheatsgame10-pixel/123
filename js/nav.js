const NAV_GROUPS = [
  { title: 'Основное', items: [
    { id: 'dashboard', label: 'Главная', icon: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>' },
    { id: 'leaders', label: 'Список лидеров', icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/>' },
    { id: 'archive', label: 'Архив лидеров', icon: '<path d="M3 7h18v13H3z"/><path d="M5 4h14v3H5z"/><path d="M10 12h4"/>' },
    { id: 'news', label: 'Новости', icon: '<path d="M4 5h13v14H4z"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M7 9h7M7 12h7M7 15h5"/>' }
  ]},
  { title: 'Работа', items: [
    { id: 'duties', label: 'Обязанности', icon: '<path d="M9 5h6l1 2h3v14H5V7h3z"/><path d="m9 13 2 2 4-4"/>' },
    { id: 'faction-checks', label: 'Проверка фракций', icon: '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5M8 17h3"/>' }
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

function dutySubmenuHtml(){
  if (state.tab !== 'duties') return '';
  const current = typeof _dutySubTab === 'string' ? _dutySubTab : 'duties';
  return `<div class="nav-submenu open" aria-label="Подразделы обязанностей">
    <button class="nav-subitem${current === 'duties' ? ' active' : ''}" data-duty-subtab="duties"><span class="nav-subdot"></span><span>Обязанности</span></button>
    <button class="nav-subitem${current === 'stats' ? ' active' : ''}" data-duty-subtab="stats"><span class="nav-subdot"></span><span>Статистика</span></button>
  </div>`;
}

function factionChecksSubmenuHtml(){
  if (state.tab !== 'faction-checks') return '';
  const current = typeof _factionCheckSubTab === 'string' ? _factionCheckSubTab : 'pgf';
  return `<div class="nav-submenu open" aria-label="Подразделы проверки фракций">
    <button class="nav-subitem${current === 'pgf' ? ' active' : ''}" data-faction-check-subtab="pgf"><span class="nav-subdot"></span><span>Проверка 3.22 ПГФ</span></button>
    <button class="nav-subitem${current === 'nicknames' ? ' active' : ''}" data-faction-check-subtab="nicknames"><span class="nav-subdot"></span><span>Проверка ников</span></button>
  </div>`;
}

function navItemHtml(i){
  const active = state.tab === i.id;
  if (i.id === 'duties') {
    return `<div class="nav-item-wrap duties-nav-wrap">
      <button class="nav-item${active ? ' active' : ''}" data-tab="duties" aria-expanded="${active ? 'true' : 'false'}">
        ${navIcon(i.icon)}<span>${i.label}</span><span class="nav-chevron">⌄</span>
      </button>
      ${dutySubmenuHtml()}
    </div>`;
  }
  if (i.id === 'faction-checks') {
    return `<div class="nav-item-wrap faction-checks-nav-wrap">
      <button class="nav-item${active ? ' active' : ''}" data-tab="faction-checks" aria-expanded="${active ? 'true' : 'false'}">
        ${navIcon(i.icon)}<span>${i.label}</span><span class="nav-chevron">⌄</span>
      </button>
      ${factionChecksSubmenuHtml()}
    </div>`;
  }
  return `<button class="nav-item${active ? ' active' : ''}" data-tab="${i.id}">${navIcon(i.icon)}<span>${i.label}</span></button>`;
}

function renderSidebar(){
  const el = document.getElementById('sidebar');
  const u = state.user;
  const groups = NAV_GROUPS
    .map(g => ({ title: g.title, items: g.items.filter(i => canAccessTab(i.id)) }))
    .filter(g => g.items.length);

  let meExtra = '';
  if (u) {
    const ownFaction = typeof u.faction === 'string' && u.faction ? u.faction : '';
    if (ownFaction) {
      meExtra += `<div class="me-faction">${factionChipHtml(ownFaction)}</div>`;
    }
    if (isStaff() && curatedFactions().length) {
      const badges = curatedFactions().filter(f => f && f !== ownFaction).map(f => factionChipHtml(f)).join(' ');
      if (badges) meExtra += `<div class="me-factions">${badges}</div>`;
    }
  }

  const discordLogin = u?.discordUsername ? `@${u.discordUsername}` : (u?.discordDisplayName || 'Discord');
  const displayName = cleanDiscordGuildNickname(u?.displayName || u?.discordGuildNickname || u?.discordDisplayName || u?.email || 'Пользователь');
  el.innerHTML = `
    <div class="brand" data-tab="${isSignedIn() ? 'dashboard' : 'leaders'}" role="button" tabindex="0">
      <div class="brand-text">GTA5RP <span>HUB</span></div>
    </div>
    <nav class="nav">
      ${groups.map(g => `
        <div class="nav-group">
          <div class="nav-group-title">${g.title}</div>
          ${g.items.map(navItemHtml).join('')}
        </div>`).join('')}
    </nav>
    <div class="sidebar-foot">
      ${u ? `
        <div class="me-card">
          <div class="me-identity">
            <div class="me-avatar-shell">${avatarHtml(u.avatarUrl, displayName, 'me-avatar')}</div>
            <div class="me-meta">
              <div class="me-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
              <div class="me-discord" title="Discord: ${escapeHtml(discordLogin)}">${escapeHtml(discordLogin)}</div>
            </div>
          </div>
          <div class="me-role">
            ${roleBadge(u)}
            ${(isStaff() || isSiteAdmin()) ? levelBadge(u.serverLevel) : ''}
          </div>
          ${meExtra}
        </div>
        <button class="btn btn-ghost btn-block" data-action="logout">Выйти</button>`
      : `<button class="btn btn-primary btn-block" data-action="login">Войти через Discord</button>`}
    </div>`;
}

function paletteIcon(){
  return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 1.2-2.4 1.5 1.5 0 0 1 1.2-2.4H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10.5" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/><circle cx="14" cy="7" r=".8" fill="currentColor"/><circle cx="17" cy="10" r=".8" fill="currentColor"/></svg>`;
}

function renderTopbar(){
  const right = document.getElementById('topbarRight');
  updateDateTime();
  if (!isSignedIn()) {
    right.innerHTML = '';
    return;
  }
  const currentTheme = document.documentElement.dataset.theme || 'purple';
  let savedTheme = 'purple';
  try { savedTheme = localStorage.getItem(themeStorageKey()) || currentTheme; } catch (_) {}
  const customColor = /^custom:(#[0-9a-f]{6})$/i.exec(savedTheme)?.[1] || '#8b5cff';
  const unread = typeof _unreadCount === 'number' ? _unreadCount : 0;
  right.innerHTML = `
    <div class="theme-control">
      <button class="btn btn-icon theme-btn" id="themeTopBtn" title="Цвет сайта" aria-haspopup="true" aria-expanded="false">${paletteIcon()}</button>
      <div class="theme-palette" id="themePalette" role="menu" aria-label="Цвет сайта">
        ${THEME_NAMES.map(theme => `<button class="theme-swatch theme-${theme}${currentTheme === theme ? ' active' : ''}" data-theme-choice="${theme}" title="${THEME_LABELS[theme]}" aria-label="${THEME_LABELS[theme]}"></button>`).join('')}
        <label class="theme-custom-picker" title="Свой цвет" aria-label="Свой цвет"><input type="color" id="themeCustomColor" value="${escapeHtml(customColor)}"><span>+</span></label>
      </div>
    </div>
    <button class="btn btn-icon discord-refresh-btn" data-action="discord-refresh" title="Обновить данные Discord" aria-label="Обновить данные Discord">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.9-4"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 4"/><path d="M20 20v-4h-4"/></svg>
    </button>
    <button class="btn btn-icon support-btn" id="supportTopBtn" title="Поддержка">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 8v.01M12 11v.01"/></svg>
      <span id="supportUnreadBadge" class="support-badge" hidden>${unread >= 10 ? '9+' : unread}</span>
    </button>
  `;

  document.getElementById('supportTopBtn')?.addEventListener('click', openSupportModal);
  const themeBtn = document.getElementById('themeTopBtn');
  const palette = document.getElementById('themePalette');
  themeBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const open = !palette.classList.contains('open');
    closeAllDropdowns(palette);
    palette.classList.toggle('open', open);
    themeBtn.setAttribute('aria-expanded', String(open));
  });
  palette?.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      applyTheme(btn.dataset.themeChoice, true);
      palette.querySelectorAll('.theme-swatch').forEach(x => x.classList.toggle('active', x === btn));
      palette.classList.remove('open');
      themeBtn?.setAttribute('aria-expanded', 'false');
    });
  });
  document.getElementById('themeCustomColor')?.addEventListener('change', e => {
    e.stopPropagation();
    applyTheme(`custom:${e.target.value}`, true);
    palette?.querySelectorAll('.theme-swatch').forEach(x => x.classList.remove('active'));
    palette?.classList.remove('open');
    themeBtn?.setAttribute('aria-expanded', 'false');
  });
}

function setPageTitle(tab){
  document.getElementById('pageTitle').textContent = TAB_TITLES[tab] || 'GTA5RP HUB';
}

function toggleSidebar(force){
  const currentlyOpen = !document.body.classList.contains('sidebar-collapsed');
  const open = typeof force === 'boolean' ? force : !currentlyOpen;
  document.body.classList.toggle('sidebar-collapsed', !open);
  document.body.classList.toggle('sidebar-mobile-open', open && window.innerWidth <= 840);
  document.getElementById('menuBtn')?.setAttribute('aria-expanded', String(open));
}

function updateDateTime(){
  const el = document.getElementById('topbarDateTime');
  if (!el) return;
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'short',
    day: 'numeric',
    month: 'long'
  }).format(now).replace(/^./, c => c.toUpperCase());
  const timeStr = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);
  el.innerHTML = `
    <span class="topbar-date">${escapeHtml(dateParts)}</span>
    <span class="topbar-time">${escapeHtml(timeStr)}</span>
    <span class="topbar-tz">МСК</span>
  `;
}

let _dateTimeInterval = null;
function startDateTimeUpdater(){
  updateDateTime();
  if (_dateTimeInterval) clearInterval(_dateTimeInterval);
  _dateTimeInterval = setInterval(updateDateTime, 60000);
}
