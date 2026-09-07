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
  if (!isSignedIn()) {
    right.innerHTML = '';
    return;
  }
  right.innerHTML = `
    <button class="btn btn-icon support-btn" id="supportTopBtn" title="Поддержка">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 8v.01M12 11v.01"/></svg>
      <span id="supportUnreadBadge" class="support-badge" hidden>${_unreadCount}</span>
    </button>
  `;
  document.getElementById('supportTopBtn')?.addEventListener('click', openSupportModal);
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
    <div>
      <span class="topbar-date">${dateStr}</span>
      <span class="topbar-time">${timeStr}</span>
      <span class="topbar-tz">${tz}</span>
    </div>
    <div class="theme-picker">
      <div class="theme-color" data-theme="blue" title="Синий"></div>
      <div class="theme-color" data-theme="orange" title="Оранжевый"></div>
      <div class="theme-color" data-theme="red" title="Красный"></div>
      <div class="theme-color" data-theme="green" title="Зелёный"></div>
      <div class="theme-color" data-theme="purple" title="Фиолетовый"></div>
    </div>
  `;
  initThemePicker();
}

let _dateTimeInterval = null;
function startDateTimeUpdater(){
  updateDateTime();
  if (_dateTimeInterval) clearInterval(_dateTimeInterval);
  _dateTimeInterval = setInterval(updateDateTime, 60000);
}

const THEME_COLORS = {
  blue: {
    // Base colors
    bg: '#05070d',
    bg2: '#0a0f1e',
    bg3: '#0f1529',
    sidebar: 'rgba(8, 11, 22, .72)',
    surface: '#0c1122',
    surfaceHover: '#121a33',
    surfaceElevated: '#131a3a',
    border: 'rgba(79, 140, 255, 0.13)',
    borderStrong: 'rgba(79, 140, 255, 0.26)',
    // Accent colors
    primary: '#4f8cff',
    hover: '#3a7be6',
    active: '#2e6ad0',
    light: 'rgba(79, 140, 255, 0.15)',
    soft: 'rgba(79, 140, 255, 0.08)',
    glow: 'rgba(79, 140, 255, 0.25)',
    bgGradient1: 'rgba(79, 140, 255, 0.20)',
    bgGradient2: 'rgba(79, 140, 255, 0.08)',
    bgPattern: 'rgba(79, 140, 255, 0.12)'
  },
  orange: {
    // Base colors - warm dark orange-gray
    bg: '#0d0a07',
    bg2: '#14120e',
    bg3: '#1a1610',
    sidebar: 'rgba(18, 14, 8, .72)',
    surface: '#16140f',
    surfaceHover: '#1e1a14',
    surfaceElevated: '#2a2418',
    border: 'rgba(255, 140, 66, 0.13)',
    borderStrong: 'rgba(255, 140, 66, 0.26)',
    // Accent colors
    primary: '#ff8c42',
    hover: '#e67a3a',
    active: '#cc6f30',
    light: 'rgba(255, 140, 66, 0.15)',
    soft: 'rgba(255, 140, 66, 0.08)',
    glow: 'rgba(255, 140, 66, 0.25)',
    bgGradient1: 'rgba(255, 140, 66, 0.20)',
    bgGradient2: 'rgba(255, 140, 66, 0.08)',
    bgPattern: 'rgba(255, 140, 66, 0.12)'
  },
  red: {
    // Base colors - dark burgundy
    bg: '#0d0709',
    bg2: '#120e10',
    bg3: '#181214',
    sidebar: 'rgba(18, 10, 12, .72)',
    surface: '#161010',
    surfaceHover: '#1e1416',
    surfaceElevated: '#2a1818',
    border: 'rgba(255, 84, 104, 0.13)',
    borderStrong: 'rgba(255, 84, 104, 0.26)',
    // Accent colors
    primary: '#ff5468',
    hover: '#e64a5c',
    active: '#cc424a',
    light: 'rgba(255, 84, 104, 0.15)',
    soft: 'rgba(255, 84, 104, 0.08)',
    glow: 'rgba(255, 84, 104, 0.25)',
    bgGradient1: 'rgba(255, 84, 104, 0.20)',
    bgGradient2: 'rgba(255, 84, 104, 0.08)',
    bgPattern: 'rgba(255, 84, 104, 0.12)'
  },
  green: {
    // Base colors - dark green-gray
    bg: '#070d0a',
    bg2: '#0e120f',
    bg3: '#141813',
    sidebar: 'rgba(10, 16, 12, .72)',
    surface: '#0f1310',
    surfaceHover: '#161a16',
    surfaceElevated: '#1e2418',
    border: 'rgba(61, 220, 132, 0.13)',
    borderStrong: 'rgba(61, 220, 132, 0.26)',
    // Accent colors
    primary: '#3ddc84',
    hover: '#35c476',
    active: '#2a9e5f',
    light: 'rgba(61, 220, 132, 0.15)',
    soft: 'rgba(61, 220, 132, 0.08)',
    glow: 'rgba(61, 220, 132, 0.25)',
    bgGradient1: 'rgba(61, 220, 132, 0.20)',
    bgGradient2: 'rgba(61, 220, 132, 0.08)',
    bgPattern: 'rgba(61, 220, 132, 0.12)'
  },
  purple: {
    // Base colors - dark purple-gray
    bg: '#09070d',
    bg2: '#100e16',
    bg3: '#16131c',
    sidebar: 'rgba(12, 10, 18, .72)',
    surface: '#110f16',
    surfaceHover: '#18161f',
    surfaceElevated: '#241e2a',
    border: 'rgba(139, 92, 255, 0.13)',
    borderStrong: 'rgba(139, 92, 255, 0.26)',
    // Accent colors
    primary: '#8b5cff',
    hover: '#7d52e6',
    active: '#6342b8',
    light: 'rgba(139, 92, 255, 0.15)',
    soft: 'rgba(139, 92, 255, 0.08)',
    glow: 'rgba(139, 92, 255, 0.25)',
    bgGradient1: 'rgba(139, 92, 255, 0.20)',
    bgGradient2: 'rgba(139, 92, 255, 0.08)',
    bgPattern: 'rgba(139, 92, 255, 0.12)'
  }
};

function initThemePicker(){
  const savedTheme = localStorage.getItem('theme') || 'blue';
  applyTheme(savedTheme);

  document.querySelectorAll('.theme-color').forEach(el => {
    el.addEventListener('click', () => {
      const theme = el.dataset.theme;
      localStorage.setItem('theme', theme);
      applyTheme(theme);
    });
  });
}

function applyTheme(theme){
  const colors = THEME_COLORS[theme] || THEME_COLORS.blue;
  const root = document.documentElement;
  
  // Apply base colors
  root.style.setProperty('--theme-bg', colors.bg);
  root.style.setProperty('--theme-bg-2', colors.bg2);
  root.style.setProperty('--theme-bg-3', colors.bg3);
  root.style.setProperty('--theme-sidebar', colors.sidebar);
  root.style.setProperty('--theme-surface', colors.surface);
  root.style.setProperty('--theme-surface-hover', colors.surfaceHover);
  root.style.setProperty('--theme-surface-elevated', colors.surfaceElevated);
  root.style.setProperty('--theme-border', colors.border);
  root.style.setProperty('--theme-border-strong', colors.borderStrong);
  
  // Apply accent colors
  root.style.setProperty('--theme-primary', colors.primary);
  root.style.setProperty('--theme-primary-hover', colors.hover);
  root.style.setProperty('--theme-primary-active', colors.active);
  root.style.setProperty('--theme-primary-light', colors.light);
  root.style.setProperty('--theme-primary-soft', colors.soft);
  root.style.setProperty('--theme-primary-glow', colors.glow);
  root.style.setProperty('--theme-bg-gradient-1', colors.bgGradient1);
  root.style.setProperty('--theme-bg-gradient-2', colors.bgGradient2);
  root.style.setProperty('--theme-bg-pattern', colors.bgPattern);

  document.querySelectorAll('.theme-color').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === theme);
  });
}
