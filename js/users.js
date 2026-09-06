let _users = [];
let _pendingUsers = [];
let _presence = {};
let _showDeleted = false;

async function loadPendingUsers(){
  const root = document.getElementById('pendingRoot');
  if (!root) return;
  if (!isSiteAdmin()){
    root.innerHTML = lockedState('Раздел доступен только администратору сайта.');
    return;
  }
  root.innerHTML = skeletonRows(3);
  try {
    const snap = await db.collection('pendingUsers').get();
    _pendingUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderPendingUsers();
  } catch (err){
    console.error('Заявки', err);
    root.innerHTML = errorState('Не удалось загрузить заявки. ' + humanError(err), 'retry-pending');
  }
}

function renderPendingUsers(){
  const root = document.getElementById('pendingRoot');
  if (!_pendingUsers.length){
    root.innerHTML = emptyState('Нет ожидающих подтверждения пользователей.');
    return;
  }
  root.innerHTML = `
    <div class="pending-list">
      ${_pendingUsers.map(p => {
        const activeFactions = state.factions.filter(f => f.active !== false).sort((a,b) => a.name.localeCompare(b.name, 'ru'));
        const factionOptions = activeFactions.map(f => `<div class="dropdown-option" data-value="${escapeHtml(f.id)}" data-uid="${escapeHtml(p.uid)}">${escapeHtml(f.name)}</div>`).join('');
        const factionSelectOptions = activeFactions.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
        return `
        <div class="pending-item">
          <div class="pending-info">
            <b>${escapeHtml(p.displayName || p.email)}</b> (${escapeHtml(p.email)})
            <span class="hint">попытка входа ${fmtDateTime(p.attemptedAt)}</span>
          </div>
          <div class="pending-actions">
            <select class="select-inline pending-role" data-uid="${escapeHtml(p.uid)}">
              <option value="user">Пользователь</option>
              <option value="leader">Лидер</option>
              <option value="curator_assistant">Помощник куратора</option>
              <option value="curator">Куратор</option>
              <option value="server_admin">Администратор сервера</option>
              <option value="site_admin">Администратор сайта</option>
            </select>
            <div class="pending-level-wrap" data-uid="${escapeHtml(p.uid)}">
              <select class="select-inline pending-level" data-uid="${escapeHtml(p.uid)}">
                <option value="1">Уровень 1</option>
                <option value="2">Уровень 2</option>
                <option value="3">Уровень 3</option>
                <option value="4">Уровень 4</option>
                <option value="5">Уровень 5</option>
                <option value="6">Уровень 6</option>
              </select>
            </div>
            <div class="pending-leader-faction-wrap" data-uid="${escapeHtml(p.uid)}" style="display:none;">
              <select class="select-inline pending-leader-faction" data-uid="${escapeHtml(p.uid)}">
                <option value="">Выберите фракцию</option>
                ${factionSelectOptions}
              </select>
            </div>
            <div class="pending-factions-wrap" data-uid="${escapeHtml(p.uid)}" style="display:none;">
              <div class="custom-dropdown" data-uid="${escapeHtml(p.uid)}">
                <div class="dropdown-display" data-uid="${escapeHtml(p.uid)}">Выберите фракции</div>
                <div class="dropdown-options" data-uid="${escapeHtml(p.uid)}">
                  ${factionOptions}
                </div>
              </div>
            </div>
            <button class="btn btn-primary btn-sm approve-btn" data-uid="${escapeHtml(p.uid)}">Одобрить</button>
            <button class="btn btn-ghost btn-sm deny-btn" data-uid="${escapeHtml(p.uid)}">Отклонить</button>
          </div>
        </div>
      `}).join('')}
    </div>
  `;

  document.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => approveUser(btn.dataset.uid));
  });
  document.querySelectorAll('.deny-btn').forEach(btn => {
    btn.addEventListener('click', () => denyUser(btn.dataset.uid));
  });

  document.querySelectorAll('.pending-role').forEach(sel => {
    sel.addEventListener('change', function(e) {
      const uid = this.dataset.uid;
      const role = this.value;
      const levelWrap = document.querySelector(`.pending-level-wrap[data-uid="${uid}"]`);
      const leaderFactionWrap = document.querySelector(`.pending-leader-faction-wrap[data-uid="${uid}"]`);
      const factionsWrap = document.querySelector(`.pending-factions-wrap[data-uid="${uid}"]`);
      if (levelWrap) {
        const isStaffRole = STAFF_ROLES.includes(role) || role === 'site_admin';
        levelWrap.style.display = isStaffRole ? 'inline-block' : 'none';
      }
      if (leaderFactionWrap) {
        leaderFactionWrap.style.display = role === 'leader' ? 'inline-block' : 'none';
      }
      if (factionsWrap) {
        const isCuratorRole = role === 'curator_assistant' || role === 'curator';
        factionsWrap.style.display = isCuratorRole ? 'block' : 'none';
      }
    });
    const event = new Event('change');
    sel.dispatchEvent(event);
  });

  document.querySelectorAll('.custom-dropdown').forEach(wrap => {
    const uid = wrap.dataset.uid;
    const display = wrap.querySelector('.dropdown-display');
    const options = wrap.querySelector('.dropdown-options');
    const selected = new Set();

    display.addEventListener('click', (e) => {
      e.stopPropagation();
      options.classList.toggle('open');
    });

    options.querySelectorAll('.dropdown-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        const val = opt.dataset.value;
        if (selected.has(val)) {
          selected.delete(val);
          opt.classList.remove('selected');
        } else {
          selected.add(val);
          opt.classList.add('selected');
        }
        display.textContent = selected.size ? Array.from(selected).map(v => {
          const optEl = options.querySelector(`[data-value="${v}"]`);
          return optEl ? optEl.textContent : v;
        }).join(', ') : 'Выберите фракции';
        e.stopPropagation();
      });
    });

    document.addEventListener('click', () => {
      options.classList.remove('open');
    });
  });
}

async function approveUser(uid){
  const pending = _pendingUsers.find(p => p.uid === uid);
  if (!pending) return;
  const roleSelect = document.querySelector(`.pending-role[data-uid="${uid}"]`);
  const levelSelect = document.querySelector(`.pending-level[data-uid="${uid}"]`);
  const leaderFactionSelect = document.querySelector(`.pending-leader-faction[data-uid="${uid}"]`);
  const factionsSelect = document.querySelector(`.pending-factions[data-uid="${uid}"]`);
  const systemRole = roleSelect ? roleSelect.value : 'user';
  const serverLevel = (STAFF_ROLES.includes(systemRole) || systemRole === 'site_admin') ? parseInt(levelSelect.value) : 1;

  let permissions = [];
  if (systemRole === 'curator_assistant' || systemRole === 'curator') {
    permissions = ['viewReports'];
  }

  let curatedFactions = [];
  if (factionsSelect) {
    curatedFactions = Array.from(factionsSelect.selectedOptions).map(opt => opt.value).filter(v => v);
  }

  const customDropdown = document.querySelector(`.custom-dropdown[data-uid="${uid}"]`);
  if (customDropdown) {
    const selectedOptions = customDropdown.querySelectorAll('.dropdown-option.selected');
    curatedFactions = Array.from(selectedOptions).map(opt => opt.dataset.value);
  }

  let faction = null;
  if (systemRole === 'leader' && leaderFactionSelect) {
    faction = leaderFactionSelect.value || null;
  }

  try {
    const batch = db.batch();
    const userRef = db.collection('users').doc(uid);
    const data = {
      uid: pending.uid,
      email: pending.email,
      displayName: pending.displayName || '',
      avatarUrl: '',
      serverLevel,
      systemRole,
      faction: faction,
      curatedFactions: curatedFactions,
      permissions: permissions,
      reportEditingEnabled: false,
      active: true,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    batch.set(userRef, data);
    batch.delete(db.collection('pendingUsers').doc(uid));
    await batch.commit();
    toast(`Пользователь ${pending.displayName || pending.email} одобрен`);
    loadPendingUsers();
  } catch (err){
    failToast(err, 'Не удалось одобрить пользователя');
  }
}

async function denyUser(uid){
  const pending = _pendingUsers.find(p => p.uid === uid);
  if (!pending) return;
  const ok = await confirmDialog({ title: 'Отклонить заявку?', text: `Пользователь ${pending.displayName || pending.email} не сможет войти.`, okText: 'Отклонить', danger: true });
  if (!ok) return;
  try {
    await db.collection('pendingUsers').doc(uid).delete();
    toast('Заявка отклонена');
    loadPendingUsers();
  } catch (err){
    failToast(err, 'Не удалось отклонить заявку');
  }
}

async function loadUsers(){
  const root = document.getElementById('usersRoot');
  if (!isSiteAdmin() && !isStaff()){ root.innerHTML = lockedState('Раздел доступен администрации.'); return; }
  if (!document.getElementById('usersList')) root.innerHTML = skeletonRows(6);
  else document.getElementById('usersList').innerHTML = skeletonRows(6);
  try {
    let snap;
    if (isSiteAdmin()){
      snap = await db.collection('users').get();
    } else if (isStaff() && myLevel() >= 4){
      snap = await db.collection('users').where('systemRole', 'in', ['user', 'leader', 'curator_assistant', 'curator', 'server_admin']).get();
    } else if (curatedFactions().length){
      snap = await db.collection('users').where('faction', 'in', curatedFactions().slice(0, 30)).get();
    } else {
      _users = [];
      renderUsers();
      return;
    }
    _users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    _users.sort((a, b) => roleWeight(b.systemRole) - roleWeight(a.systemRole) || String(a.displayName || a.email).localeCompare(String(b.displayName || b.email), 'ru'));
    _presence = await loadPresenceMap(_users.map(u => u.uid));
    renderUsers();
  } catch (err){
    console.error('Пользователи', err);
    root.innerHTML = errorState('Не удалось загрузить пользователей. ' + humanError(err), 'retry-users');
  }
}

function roleWeight(r){
  return ['user', 'leader', 'curator_assistant', 'curator', 'server_admin', 'site_admin'].indexOf(r);
}

function renderUsers(){
  const root = document.getElementById('usersRoot');
  if (!document.getElementById('usersList')){
    root.innerHTML = `
      <div class="toolbar">
        <div class="stats-row" id="usersStats"></div>
        <div class="toolbar-right">
          <label class="toggle-label" id="showDeletedWrap" ${isSiteAdmin() ? '' : 'hidden'}>
            <span class="toggle-label-text">Показать удалённых</span>
            <label class="toggle">
              <input type="checkbox" id="showDeleted" ${_showDeleted ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </label>
          <label class="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="search" id="usersSearch" placeholder="Ник, email, роль или фракция" value="${escapeHtml(state.usersSearch)}" autocomplete="off">
          </label>
        </div>
      </div>
      <div id="usersList"></div>`;
    document.getElementById('usersSearch').addEventListener('input', debounce(e => { state.usersSearch = e.target.value; renderUsers(); }, 150));
    if (document.getElementById('showDeleted')) {
      document.getElementById('showDeleted').addEventListener('change', e => {
        _showDeleted = e.target.checked;
        renderUsers();
      });
    }
  }
  const q = state.usersSearch.trim().toLowerCase();
  let rows = q ? _users.filter(u =>
    (u.displayName || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (ROLES[u.systemRole] || '').toLowerCase().includes(q) ||
    factionName(u.faction).toLowerCase().includes(q)) : _users;

  if (!_showDeleted) {
    rows = rows.filter(u => u.deleted !== true);
  }

  const admins = _users.filter(u => STAFF_ROLES.includes(u.systemRole) || u.systemRole === 'site_admin').length;
  const online = _users.filter(u => isOnline(_presence[u.uid])).length;
  document.getElementById('usersStats').innerHTML = `
    <span class="stat-chip static"><b>${_users.length}</b>${isManager() ? 'пользователей' : 'лидеров'}</span>
    ${isManager() ? `<span class="stat-chip static"><b>${admins}</b>администрации</span>` : ''}
    <span class="stat-chip static" data-tone="green"><b>${online}</b>в сети</span>`;
  document.getElementById('usersList').innerHTML = !rows.length ? emptyState(_users.length ? 'Ничего не найдено.' : (isManager() ? 'Пока никто не входил в систему.' : 'В ваших фракциях пока нет лидеров с аккаунтом.')) : `
    <div class="card table-card">
      <table class="data-table users-table">
        <thead><tr><th>Пользователь</th><th>Роль</th><th>Уровень</th><th>Фракции</th><th>Статус</th><th>В системе с</th><th></th></tr></thead>
        <tbody>${rows.map(u => `
          <tr class="${u.active === false || u.deleted === true ? 'row-muted' : ''}">
            <td><div class="user-cell">${avatarHtml(u.avatarUrl, u.displayName || u.email, 'avatar-sm')}<div><div class="uc-name">${escapeHtml(u.displayName || '—')}</div><div class="uc-email mono">${escapeHtml(u.email)}</div></div></td>
            <td>${roleBadge(u)}</td>
            <td>${(u.systemRole === 'leader' || u.systemRole === 'user') ? '<span class="hint">—</span>' : levelBadge(u.serverLevel)}</td>
            <td>${userFactionsText(u)}</td>
            <td>${u.deleted === true ? '<span class="badge badge-grey">Удалён</span>' : (u.active === false ? '<span class="badge badge-grey">Отключён</span>' : presenceBadge(_presence[u.uid]))}</td>
            <td class="mono">${fmtDate(u.createdAt)}</td>
            <td class="td-actions">${userActionsHtml(u)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function userFactionsText(u){
  if (u.systemRole === 'leader') return escapeHtml(factionName(u.faction));
  if (Array.isArray(u.curatedFactions) && u.curatedFactions.length) return escapeHtml(u.curatedFactions.map(factionName).join(', '));
  return '<span class="hint">—</span>';
}

function userActionsHtml(u){
  if (isSiteAdmin()) {
    const buttons = `<button class="btn btn-ghost btn-sm" data-action="user-edit" data-id="${escapeHtml(u.uid)}">Изменить</button>`;
    if (u.uid !== state.user.uid) {
      if (u.deleted !== true) {
        return buttons + `<button class="btn btn-ghost btn-sm danger-text" data-action="user-delete" data-id="${escapeHtml(u.uid)}">Удалить</button>`;
      } else {
        return buttons + `<button class="btn btn-ghost btn-sm" data-action="user-restore" data-id="${escapeHtml(u.uid)}">Восстановить</button>`;
      }
    }
    return buttons;
  }
  const out = [];
  if (canManageCurationOf(u) || canChangeLevelOf(u)) out.push(`<button class="btn btn-ghost btn-sm" data-action="user-edit" data-id="${escapeHtml(u.uid)}">Назначение</button>`);
  if (isStaff() && can('editLeaderNickname') && u.systemRole === 'leader' && curates(u.faction)) out.push(`<button class="btn btn-ghost btn-sm" data-action="user-rename" data-id="${escapeHtml(u.uid)}">Изменить ник</button>`);
  return out.join('');
}

function openUserModal(uid){
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  const self = uid === state.user.uid;
  const admin = isSiteAdmin();
  const curationOk = canManageCurationOf(u);
  const levelOk = canChangeLevelOf(u);
  if (!admin && !curationOk && !levelOk) return;
  const curated = Array.isArray(u.curatedFactions) ? u.curatedFactions : [];
  const perms = Array.isArray(u.permissions) ? u.permissions : [];
  const roleOptions = admin ? Object.keys(ROLES) : CURATION_ROLES;
  const permOptions = admin ? Object.keys(PERMISSIONS) : CURATION_PERMISSIONS;
  const factionsForCuration = assignableFactionIds();
  const levelOptions = admin ? [1, 2, 3, 4, 5, 6] : (levelOk ? [1, 2, 3, 4, 5, 6] : [Number(u.serverLevel) || 1]);

  const availableFactions = state.factions.filter(f => f.active !== false && factionsForCuration.includes(f.id));
  const grouped = {};
  availableFactions.forEach(f => {
    const cat = f.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(f);
  });
  Object.keys(grouped).forEach(cat => grouped[cat].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
  const catOrder = ['gov', 'judicial', 'street', 'syndicate', 'other'];
  let curatedOptions = '';
  catOrder.forEach(cat => {
    if (grouped[cat] && grouped[cat].length) {
      grouped[cat].forEach(f => {
        curatedOptions += `<div class="dropdown-option" data-value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</div>`;
      });
    }
  });
  if (!curatedOptions) {
    curatedOptions = '<div class="dropdown-option" data-value="">Нет доступных фракций</div>';
  }

  const permList = admin ? Object.keys(PERMISSIONS) : CURATION_PERMISSIONS;
  let permOptionsHtml = '';
  permList.forEach(p => {
    permOptionsHtml += `<div class="dropdown-option" data-value="${p}"${perms.includes(p) ? ' selected' : ''}>${PERMISSIONS[p]}</div>`;
  });
  if (!permOptionsHtml) {
    permOptionsHtml = '<div class="dropdown-option" data-value="">Нет доступных прав</div>';
  }

  const activeChecked = u.active !== false ? 'checked' : '';
  const deletedChecked = u.deleted === true ? 'checked' : '';
  const reportEditChecked = u.reportEditingEnabled ? 'checked' : '';
  const disabledAttr = (self || !admin) ? 'disabled' : '';

  openModal(`
    <h2>${escapeHtml(u.displayName || u.email)}</h2>
    <p class="sub mono">${escapeHtml(u.email)}${self ? ' · это ваш аккаунт: роль и права себе изменить нельзя' : ''}</p>
    <div class="grid-2">
      <div class="field"><label for="uName">Никнейм</label><input type="text" id="uName" maxlength="80" value="${escapeHtml(u.displayName || '')}" ${admin ? '' : 'disabled'}></div>
      <div class="field" id="uLevelWrap"><label for="uLevel">Серверный уровень</label><select id="uLevel" ${(self || !(admin || levelOk)) ? 'disabled' : ''}>${levelOptions.map(n => `<option value="${n}"${Number(u.serverLevel) === n ? ' selected' : ''}>${LEVELS[n]}</option>`).join('')}</select></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="uRole">Системная роль</label><select id="uRole" ${(self || !(admin || curationOk)) ? 'disabled' : ''}>${roleOptions.map(r => `<option value="${r}"${u.systemRole === r ? ' selected' : ''}>${ROLES[r]}</option>`).join('')}</select></div>
      <div class="field" id="uFactionWrap"><label for="uFaction">Фракция лидера</label><select id="uFaction" ${(self || !admin) ? 'disabled' : ''}>${factionGroupedOptionsHtml(u.faction || '', 'Не назначена')}</select></div>
    </div>
    <div class="field" id="uCuratedWrap">
      <label>Курируемые фракции</label>
      <div class="custom-dropdown modal-dropdown">
        <div class="dropdown-display">${curated.length ? curated.map(id => escapeHtml(factionName(id))).join(', ') : 'Выберите фракции'}</div>
        <div class="dropdown-options">
          ${curatedOptions}
        </div>
      </div>
    </div>
    <div class="field" id="uPermsWrap">
      <label>Права</label>
      <div class="custom-dropdown modal-dropdown">
        <div class="dropdown-display">${perms.length ? perms.map(p => PERMISSIONS[p] || p).join(', ') : 'Выберите права'}</div>
        <div class="dropdown-options">
          ${permOptionsHtml}
        </div>
      </div>
    </div>
    ${admin ? `
      <div class="field" id="uEditWrap">
        <label class="toggle-label">
          <span class="toggle-label-text">Лидер может редактировать комментарий своих отчётов</span>
          <label class="toggle">
            <input type="checkbox" id="uReportEdit" ${reportEditChecked} ${self ? 'disabled' : ''}>
            <span class="slider"></span>
          </label>
        </label>
      </div>
      <div class="field toggle-group">
        <label class="toggle-label">
          <span class="toggle-label-text">Аккаунт активен</span>
          <label class="toggle">
            <input type="checkbox" id="uActive" ${activeChecked} ${disabledAttr}>
            <span class="slider"></span>
          </label>
        </label>
        <label class="toggle-label">
          <span class="toggle-label-text">Удалён (скрыт из списка)</span>
          <label class="toggle">
            <input type="checkbox" id="uDeleted" ${deletedChecked} ${disabledAttr}>
            <span class="slider"></span>
          </label>
        </label>
      </div>
    ` : ''}
    <div class="modal-actions">
      ${admin && !self && (STAFF_ROLES.includes(u.systemRole) || u.systemRole === 'site_admin') ? `<button class="btn btn-ghost danger-text" data-action="user-revoke" data-id="${escapeHtml(uid)}">Снять с администрации</button>` : ''}
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="uSaveBtn" data-action="user-save" data-id="${escapeHtml(uid)}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);

  document.querySelectorAll('.modal-dropdown').forEach(dropdown => {
    const display = dropdown.querySelector('.dropdown-display');
    const options = dropdown.querySelector('.dropdown-options');
    let selected = new Set();

    options.querySelectorAll('.dropdown-option').forEach(opt => {
      if (opt.classList.contains('selected')) {
        selected.add(opt.dataset.value);
      }
      opt.addEventListener('click', (e) => {
        const val = opt.dataset.value;
        if (!val) return;
        if (selected.has(val)) {
          selected.delete(val);
          opt.classList.remove('selected');
        } else {
          selected.add(val);
          opt.classList.add('selected');
        }
        const names = Array.from(selected).map(v => {
          const optEl = options.querySelector(`[data-value="${v}"]`);
          return optEl ? optEl.textContent : v;
        });
        display.textContent = names.length ? names.join(', ') : (dropdown.closest('#uPermsWrap') ? 'Выберите права' : 'Выберите фракции');
        e.stopPropagation();
      });
    });

    display.addEventListener('click', (e) => {
      e.stopPropagation();
      options.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      options.classList.remove('open');
    });
  });

  const roleSel = document.getElementById('uRole');
  const levelWrap = document.getElementById('uLevelWrap');
  const sync = () => {
    const r = roleSel.value;
    const isStaffRole = STAFF_ROLES.includes(r) || r === 'site_admin';
    const isLeaderRole = r === 'leader';
    document.getElementById('uFactionWrap').hidden = !isLeaderRole;
    const editWrap = document.getElementById('uEditWrap');
    if (editWrap) editWrap.hidden = !isLeaderRole;
    document.getElementById('uCuratedWrap').hidden = !STAFF_ROLES.includes(r);
    document.getElementById('uPermsWrap').hidden = !STAFF_ROLES.includes(r);
    levelWrap.hidden = !isStaffRole;
  };
  roleSel.addEventListener('change', sync);
  sync();
}

async function saveUser(uid){
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  const btn = document.getElementById('uSaveBtn');
  const self = uid === state.user.uid;
  const admin = isSiteAdmin();
  const patch = { updatedAt: FieldValue.serverTimestamp() };
  if (admin){
    const displayName = document.getElementById('uName').value.trim();
    if (!displayName){ toast('Введите никнейм', 'error'); return; }
    patch.displayName = displayName;
  }
  if (!self){
    const systemRole = document.getElementById('uRole').value;
    const isLeaderRole = systemRole === 'leader';
    const isStaffRole = STAFF_ROLES.includes(systemRole) || systemRole === 'site_admin';
    if (admin || canChangeLevelOf(u)) {
      if (isStaffRole) {
        patch.serverLevel = Number(document.getElementById('uLevel').value);
      } else {
        patch.serverLevel = 1;
      }
    }
    if (admin || canManageCurationOf(u)){
      patch.systemRole = systemRole;
      if (isStaffRole) {
        const factionsDropdown = document.querySelector('#uCuratedWrap .modal-dropdown');
        const selectedFactionOptions = factionsDropdown ? factionsDropdown.querySelectorAll('.dropdown-option.selected') : [];
        const curatedFactions = Array.from(selectedFactionOptions).map(opt => opt.dataset.value).filter(v => v);

        const permsDropdown = document.querySelector('#uPermsWrap .modal-dropdown');
        const selectedPermOptions = permsDropdown ? permsDropdown.querySelectorAll('.dropdown-option.selected') : [];
        let perms = Array.from(selectedPermOptions).map(opt => opt.dataset.value).filter(v => v);

        if ((systemRole === 'curator_assistant' || systemRole === 'curator') && !perms.includes('viewReports')) {
          perms.push('viewReports');
        }
        patch.curatedFactions = curatedFactions;
        patch.permissions = perms;
      } else {
        patch.curatedFactions = [];
        patch.permissions = [];
      }
    }
    if (admin){
      if (isLeaderRole) {
        const faction = document.getElementById('uFaction').value;
        if (!faction){ toast('Выберите фракцию для лидера', 'error'); return; }
        patch.faction = faction;
      } else {
        patch.faction = null;
      }
      patch.reportEditingEnabled = isLeaderRole ? document.getElementById('uReportEdit').checked : false;
      patch.active = document.getElementById('uActive').checked;
      patch.deleted = document.getElementById('uDeleted').checked;
    } else if (isLeaderRole && u.systemRole !== 'leader'){
      toast('Назначать лидеров может только администратор сайта', 'error');
      return;
    }
  } else {
    if (admin) {
      const systemRole = document.getElementById('uRole').value;
      const isStaffRole = STAFF_ROLES.includes(systemRole) || systemRole === 'site_admin';
      if (isStaffRole) {
        const factionsDropdown = document.querySelector('#uCuratedWrap .modal-dropdown');
        const selectedFactionOptions = factionsDropdown ? factionsDropdown.querySelectorAll('.dropdown-option.selected') : [];
        const curatedFactions = Array.from(selectedFactionOptions).map(opt => opt.dataset.value).filter(v => v);

        const permsDropdown = document.querySelector('#uPermsWrap .modal-dropdown');
        const selectedPermOptions = permsDropdown ? permsDropdown.querySelectorAll('.dropdown-option.selected') : [];
        let perms = Array.from(selectedPermOptions).map(opt => opt.dataset.value).filter(v => v);

        if ((systemRole === 'curator_assistant' || systemRole === 'curator') && !perms.includes('viewReports')) {
          perms.push('viewReports');
        }
        patch.curatedFactions = curatedFactions;
        patch.permissions = perms;
        patch.systemRole = systemRole;
        if (admin || canChangeLevelOf(u)) {
          if (isStaffRole) {
            patch.serverLevel = Number(document.getElementById('uLevel').value);
          } else {
            patch.serverLevel = 1;
          }
        }
        const isLeaderRole = systemRole === 'leader';
        if (isLeaderRole) {
          const faction = document.getElementById('uFaction').value;
          if (!faction){ toast('Выберите фракцию для лидера', 'error'); return; }
          patch.faction = faction;
        } else {
          patch.faction = null;
        }
        patch.reportEditingEnabled = isLeaderRole ? document.getElementById('uReportEdit').checked : false;
        patch.active = document.getElementById('uActive').checked;
        patch.deleted = document.getElementById('uDeleted').checked;
      }
    }
  }
  setLoading(btn, true);
  try {
    const batch = db.batch();
    addVersion(batch, 'user', uid, stripSystem(u));
    batch.update(db.collection('users').doc(uid), patch);
    const oldValue = pickUserFields(u);
    const newValue = pickUserFields({ ...u, ...patch });
    addAudit(batch, { action: describeUserChange(oldValue, newValue), objectType: 'user', objectId: uid, oldValue, newValue, additionalInfo: u.email, faction: newValue.faction || null });
    await batch.commit();
    closeModal();
    toast('Пользователь обновлён');
    loadUsers();
  } catch (err){
    failToast(err, 'Не удалось сохранить пользователя');
  } finally {
    setLoading(btn, false);
  }
}

function pickUserFields(u){
  return {
    displayName: u.displayName || '',
    systemRole: u.systemRole,
    serverLevel: u.serverLevel,
    faction: u.faction || null,
    curatedFactions: Array.isArray(u.curatedFactions) ? u.curatedFactions : [],
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    reportEditingEnabled: !!u.reportEditingEnabled,
    active: u.active !== false,
    deleted: u.deleted === true
  };
}

function describeUserChange(o, n){
  const parts = [];
  if (o.displayName !== n.displayName) parts.push('изменил никнейм');
  if (o.systemRole !== n.systemRole) parts.push(`изменил роль на «${ROLES[n.systemRole]}»`);
  if (o.serverLevel !== n.serverLevel) parts.push(`изменил уровень на «${LEVELS[n.serverLevel] || n.serverLevel}»`);
  if (o.faction !== n.faction) parts.push('изменил фракцию лидера');
  if (JSON.stringify(o.curatedFactions) !== JSON.stringify(n.curatedFactions)) parts.push('изменил курируемые фракции');
  if (JSON.stringify(o.permissions) !== JSON.stringify(n.permissions)) parts.push('изменил права');
  if (o.reportEditingEnabled !== n.reportEditingEnabled) parts.push(n.reportEditingEnabled ? 'разрешил редактирование отчётов' : 'запретил редактирование отчётов');
  if (o.active !== n.active) parts.push(n.active ? 'включил аккаунт' : 'отключил аккаунт');
  if (o.deleted !== n.deleted) parts.push(n.deleted ? 'пометил как удалённого' : 'восстановил из удалённых');
  if (!parts.length) return 'Сохранил пользователя без изменений';
  return parts.join(', ').replace(/^./, c => c.toUpperCase());
}

async function revokeAdmin(uid){
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  const res = await confirmDialog({ title: 'Снять с администрации?', text: `${u.displayName || u.email} станет обычным пользователем. Права и курируемые фракции будут отозваны, вся история действий сохранится.`, okText: 'Снять', reason: true });
  if (!res) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'user', uid, stripSystem(u));
    batch.update(db.collection('users').doc(uid), {
      systemRole: 'user', curatedFactions: [], permissions: [], faction: null, reportEditingEnabled: false, serverLevel: 1, updatedAt: FieldValue.serverTimestamp()
    });
    addAudit(batch, { action: 'Снял пользователя с административной должности', objectType: 'user', objectId: uid, oldValue: pickUserFields(u), newValue: { systemRole: 'user', curatedFactions: [], permissions: [] }, additionalInfo: `${u.email}. Причина: ${res.reason}` });
    await batch.commit();
    closeModal();
    toast('Пользователь снят с администрации');
    loadUsers();
  } catch (err){
    failToast(err, 'Не удалось снять пользователя');
  }
}

function openRenameModal(uid){
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  openModal(`
    <h2>Изменить никнейм лидера</h2>
    <p class="sub">${escapeHtml(factionName(u.faction))} · ${escapeHtml(u.email)}</p>
    <div class="field"><label for="rnName">Новый никнейм</label><input type="text" id="rnName" maxlength="80" value="${escapeHtml(u.displayName || '')}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="rnSaveBtn" data-action="user-rename-save" data-id="${escapeHtml(uid)}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
}

async function saveRename(uid){
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  const btn = document.getElementById('rnSaveBtn');
  const displayName = document.getElementById('rnName').value.trim();
  if (!displayName){ toast('Введите никнейм', 'error'); return; }
  setLoading(btn, true);
  try {
    const batch = db.batch();
    addVersion(batch, 'user', uid, stripSystem(u));
    batch.update(db.collection('users').doc(uid), { displayName, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: `Изменил никнейм лидера ${factionName(u.faction)}`, objectType: 'user', objectId: uid, oldValue: { displayName: u.displayName || '' }, newValue: { displayName }, faction: u.faction });
    await batch.commit();
    closeModal();
    toast('Никнейм обновлён');
    loadUsers();
  } catch (err){
    failToast(err, 'Не удалось изменить никнейм');
  } finally {
    setLoading(btn, false);
  }
}

async function deleteUser(uid){
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  if (u.uid === state.user.uid) {
    toast('Нельзя удалить самого себя', 'error');
    return;
  }
  const res = await confirmDialog({ title: 'Удалить пользователя?', text: `Пользователь ${u.displayName || u.email} будет помечен как удалённый и скрыт из списка. Его аккаунт будет отключён.`, okText: 'Удалить', danger: true, reason: true });
  if (!res) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'user', uid, stripSystem(u));
    batch.update(db.collection('users').doc(uid), {
      active: false,
      deleted: true,
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: state.user.uid,
      deleteReason: res.reason || ''
    });
    addAudit(batch, { action: 'Удалил пользователя', objectType: 'user', objectId: uid, oldValue: { displayName: u.displayName, email: u.email }, additionalInfo: res.reason || '' });
    await batch.commit();
    toast('Пользователь удалён');
    loadUsers();
  } catch (err){
    failToast(err, 'Не удалось удалить пользователя');
  }
}

async function restoreUser(uid){
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  const ok = await confirmDialog({ title: 'Восстановить пользователя?', text: `Пользователь ${u.displayName || u.email} снова появится в списке и сможет войти.`, okText: 'Восстановить', danger: false });
  if (!ok) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'user', uid, stripSystem(u));
    batch.update(db.collection('users').doc(uid), {
      active: true,
      deleted: false,
      updatedAt: FieldValue.serverTimestamp(),
      restoredAt: FieldValue.serverTimestamp(),
      restoredBy: state.user.uid
    });
    addAudit(batch, { action: 'Восстановил удалённого пользователя', objectType: 'user', objectId: uid, oldValue: { displayName: u.displayName, email: u.email } });
    await batch.commit();
    toast('Пользователь восстановлен');
    loadUsers();
  } catch (err){
    failToast(err, 'Не удалось восстановить пользователя');
  }
}
