let _dutyWeeks = {};
let _currentWeekStart = null;
let _selectedWeekStart = null;
let _factionFilter = null;
let _curatorUsers = {};
let _dutyUserNames = {};
let _unsubscribers = [];
let _dutyTemplates = {};
let _dutyTemplateDocs = {};
let _dutyTaskPoolDocs = [];
let _curatorUsersUnsub = null;
let _dutyTemplatesUnsub = null;
let _dutyTaskPoolUnsub = null;
let _dutyStatsUnsub = null;
let _dutySubTab = 'duties';
let _statisticsMode = 'all';

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function earliestDutyWeekStart() {
  const d = getMoscowNow();
  d.setMonth(d.getMonth() - 1);
  return getWeekStart(d);
}

function canGoToPreviousDutyWeek() {
  const candidate = new Date(_selectedWeekStart);
  candidate.setDate(candidate.getDate() - 7);
  return getWeekStart(candidate) >= earliestDutyWeekStart();
}

function weekLabel(weekStart) {
  const start = new Date(weekStart);
  const end = getWeekEnd(weekStart);
  return `${fmtISO(start.toISOString().slice(0,10))} — ${fmtISO(end.toISOString().slice(0,10))}`;
}

function isWeekLocked(weekStart) {
  const now = getMoscowNow();
  const end = getWeekEnd(weekStart);
  return end < now;
}

function getFactionsForDuties() {
  if (isSiteAdmin()) return state.factions.filter(f => f.active !== false).map(f => f.id);
  if (isStaff()) return curatedFactions().filter(id => state.factionsById[id] && state.factionsById[id].active !== false);
  return [];
}

function getCuratorUsersForFaction(factionId) {
  return _curatorUsers[factionId] || [];
}

function dutyUserCuratedFactions(user) {
  if (!user) return [];
  if (user.systemRole === 'chief_overseer' && user.direction) {
    const cats = DIRECTION_CATEGORIES[user.direction] || [];
    return state.factions
      .filter(f => f.active !== false && cats.includes(f.category))
      .filter(f => !(EXCLUDED_FORUM_KEYS || []).includes(f.forumKey))
      .map(f => f.id);
  }
  return Array.isArray(user.curatedFactions) ? user.curatedFactions : [];
}

function dutyUserName(uid) {
  return _dutyUserNames[uid] || 'Пользователь';
}

function normalizeDutyTemplateDoc(factionId, data) {
  const fallback = DUTY_DEFAULTS[factionId] || DEFAULT_DUTY_TASKS;
  const legacyTasks = Array.isArray(data?.tasks) && data.tasks.length ? data.tasks : fallback;
  let templates = Array.isArray(data?.templates) ? data.templates
    .filter(t => t && typeof t.name === 'string' && Array.isArray(t.tasks))
    .map(t => ({ id: String(t.id || randomId()), name: String(t.name || 'Шаблон'), tasks: [...new Set(t.tasks.filter(Boolean))] })) : [];
  if (!templates.length) templates = [{ id: 'main', name: 'Основной', tasks: [...legacyTasks] }];
  const activeTemplateId = templates.some(t => t.id === data?.activeTemplateId) ? data.activeTemplateId : templates[0].id;
  const active = templates.find(t => t.id === activeTemplateId) || templates[0];
  return { templates, activeTemplateId, tasks: active.tasks.length ? active.tasks : legacyTasks };
}

function availableDutyTasks(factionId) {
  const removedDefaults = new Set(['Проверить активность сотрудников', 'Проверить склад', 'Проверить пополнение казны']);
  const dynamic = _dutyTaskPoolDocs
    .filter(t => t.active !== false && (!t.factionId || t.factionId === factionId))
    .map(t => String(t.name || '').trim())
    .filter(Boolean);
  return [...new Set([...DUTY_TASK_POOL, ...dynamic])].filter(name => !removedDefaults.has(name));
}

async function loadCuratorUsers() {
  if (_curatorUsersUnsub) { _curatorUsersUnsub(); _curatorUsersUnsub = null; }
  _curatorUsers = {};
  _dutyUserNames = {};
  if (!(isSiteAdmin() || isStaff())) return;

  const query = canViewUsers()
    ? db.collection('users')
    : db.collection('users').where('systemRole', 'in', ['curator_assistant', 'curator']);
  await new Promise(resolve => {
    let first = true;
    _curatorUsersUnsub = query.onSnapshot(snap => {
      _curatorUsers = {};
      _dutyUserNames = {};
      const myFactions = curatedFactions();
      snap.forEach(d => {
        const rawUser = d.data();
        const u = {
          ...rawUser,
          uid: d.id,
          displayName: cleanDiscordGuildNickname(rawUser.displayName || rawUser.discordGuildNickname || rawUser.discordDisplayName || '')
        };
        _dutyUserNames[d.id] = u.displayName || u.email || 'Пользователь';
        if (u.active === false || u.deleted === true) return;
        if (!['curator_assistant', 'curator', 'chief_overseer', 'server_admin'].includes(u.systemRole)) return;
        const curated = dutyUserCuratedFactions(u);
        const factionsToAdd = isSiteAdmin() ? curated : curated.filter(fid => myFactions.includes(fid));
        factionsToAdd.forEach(fid => {
          if (!_curatorUsers[fid]) _curatorUsers[fid] = [];
          if (!_curatorUsers[fid].some(c => c.uid === d.id)) _curatorUsers[fid].push(u);
        });
      });
      Object.keys(_curatorUsers).forEach(fid => {
        _curatorUsers[fid].sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'ru'));
      });
      if (state.user?.uid) _dutyUserNames[state.user.uid] = cleanDiscordGuildNickname(state.user.displayName || state.user.discordGuildNickname || state.user.discordDisplayName || '') || state.user.email || 'Пользователь';
      if (!first && state.tab === 'duties' && _dutySubTab === 'duties') renderDutyTable();
      if (!first && state.tab === 'duties' && _dutySubTab === 'stats') loadStatistics();
      if (first) { first = false; resolve(); }
    }, err => {
      console.error('Загрузка кураторов', err);
      if (first) { first = false; resolve(); }
    });
  });
}

async function loadDutyTemplates() {
  if (_dutyTemplatesUnsub) { _dutyTemplatesUnsub(); _dutyTemplatesUnsub = null; }
  _dutyTemplates = {};
  _dutyTemplateDocs = {};
  await new Promise(resolve => {
    let first = true;
    _dutyTemplatesUnsub = db.collection('dutyTemplates').onSnapshot(snap => {
      _dutyTemplates = {};
      _dutyTemplateDocs = {};
      snap.forEach(d => {
        const normalized = normalizeDutyTemplateDoc(d.id, d.data());
        _dutyTemplateDocs[d.id] = normalized;
        _dutyTemplates[d.id] = normalized.tasks;
      });
      if (first) { first = false; resolve(); }
    }, err => {
      console.error('Шаблоны обязанностей', err);
      if (first) { first = false; resolve(); }
    });
  });
}

async function loadDutyTaskPool() {
  if (_dutyTaskPoolUnsub) { _dutyTaskPoolUnsub(); _dutyTaskPoolUnsub = null; }
  _dutyTaskPoolDocs = [];
  await new Promise(resolve => {
    let first = true;
    _dutyTaskPoolUnsub = db.collection('dutyTaskPool').onSnapshot(snap => {
      _dutyTaskPoolDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!first && state.tab === 'duties' && _dutySubTab === 'duties') renderDutyTable();
      if (first) { first = false; resolve(); }
    }, err => {
      console.error('Пул задач', err);
      if (first) { first = false; resolve(); }
    });
  });
}

async function loadDuties() {
  const root = document.getElementById('dutiesRoot');
  if (!canManageDuties()) {
    root.innerHTML = isSignedIn() ? emptyState('Раздел обязанностей доступен помощникам кураторов, кураторам и администратору сайта.') : lockedState('Войдите, чтобы открыть обязанности.');
    return;
  }
  const factionIds = getFactionsForDuties();
  if (!factionIds.length) {
    root.innerHTML = emptyState('Вам пока не назначены курируемые фракции.');
    return;
  }

  await loadCuratorUsers();
  await loadDutyTemplates();
  await loadDutyTaskPool();

  const now = getMoscowNow();
  _currentWeekStart = getWeekStart(now);
  const earliest = earliestDutyWeekStart();
  if (!_selectedWeekStart || _selectedWeekStart > _currentWeekStart) _selectedWeekStart = _currentWeekStart;
  if (_selectedWeekStart < earliest) _selectedWeekStart = earliest;

  const factionFilterHtml = _dutySubTab === 'duties' ? `
    <div class="duty-filter">
      <select id="dutyFactionSelect" class="select-inline" aria-label="Фракция обязанностей">
        <option value="">Все фракции</option>
        ${factionIds.map(id => `<option value="${escapeHtml(id)}" ${_factionFilter === id ? 'selected' : ''}>${escapeHtml(factionName(id))}</option>`).join('')}
      </select>
    </div>` : '';

  const weekNavHtml = _dutySubTab === 'duties' ? `
    <div class="duty-nav duty-week-nav">
      <button class="btn btn-icon" id="dutyPrevWeek" title="Предыдущая неделя" ${canGoToPreviousDutyWeek() ? '' : 'disabled'}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="duty-week-label" id="dutyWeekLabel">${weekLabel(_selectedWeekStart)}</span>
      <button class="btn btn-icon" id="dutyNextWeek" title="Следующая неделя" ${_selectedWeekStart >= _currentWeekStart ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <button class="btn btn-sm" id="dutyTodayBtn">Сегодня</button>
    </div>` : '';

  const editableDutyFactions = factionIds.filter(fid => canEditDutyTasks(fid));
  const editTasksButtonHtml = _dutySubTab === 'duties' && editableDutyFactions.length
    ? '<button class="btn btn-primary btn-sm" id="dutyEditTasksBtn">Редактировать задачи</button>'
    : '';

  root.innerHTML = `
    ${_dutySubTab === 'duties' ? `<div class="duty-toolbar duty-toolbar-main">
      <div class="duty-toolbar-left">${factionFilterHtml}</div>
      <div class="duty-toolbar-center">${weekNavHtml}</div>
      <div class="duty-toolbar-right">${editTasksButtonHtml}</div>
    </div>` : ''}
    <div id="dutyTableContainer"></div>`;

  if (_dutySubTab === 'duties') {
    if (_dutyStatsUnsub) { _dutyStatsUnsub(); _dutyStatsUnsub = null; }
    document.getElementById('dutyPrevWeek')?.addEventListener('click', () => {
      const d = new Date(_selectedWeekStart);
      d.setDate(d.getDate() - 7);
      const candidate = getWeekStart(d);
      if (candidate < earliestDutyWeekStart()) {
        toast('В обязанностях доступны только недели за последний месяц. Более старые данные остаются в статистике.', 'error');
        return;
      }
      _selectedWeekStart = candidate;
      loadDuties();
    });
    document.getElementById('dutyNextWeek')?.addEventListener('click', () => {
      const candidate = new Date(_selectedWeekStart);
      candidate.setDate(candidate.getDate() + 7);
      const candidateStart = getWeekStart(candidate);
      if (candidateStart > _currentWeekStart) {
        toast('Нельзя перейти на будущую неделю', 'error');
        return;
      }
      _selectedWeekStart = candidateStart;
      loadDuties();
    });
    document.getElementById('dutyTodayBtn')?.addEventListener('click', () => {
      _selectedWeekStart = _currentWeekStart;
      loadDuties();
    });
    document.getElementById('dutyEditTasksBtn')?.addEventListener('click', () => openDutyTaskEditorModal(_factionFilter));
    document.getElementById('dutyFactionSelect')?.addEventListener('change', (e) => {
      _factionFilter = e.target.value || null;
      renderDutyTable();
    });
    await renderDutyTable();
  } else {
    if (_unsubscribers.length) {
      _unsubscribers.forEach(unsub => unsub());
      _unsubscribers = [];
    }
    await loadStatistics();
  }
}

function getTaskStatus(task, weekStart) {
  const assignees = task.assignees || [];
  const completedBy = task.completedBy || [];
  const weekEnd = getWeekEnd(weekStart);
  const now = getMoscowNow();

  if (assignees.length === 0) {
    return now > weekEnd ? 'Просрочено' : 'Не начато';
  }
  if (assignees.length > 0 && assignees.every(uid => completedBy.includes(uid))) {
    return 'Выполнено';
  }
  if (now > weekEnd) {
    return 'Просрочено';
  }
  if (completedBy.length > 0) {
    return 'В процессе';
  }
  return 'Не начато';
}

function statusBadgeClass(status) {
  switch(status) {
    case 'Выполнено': return 'status-done';
    case 'Просрочено': return 'status-overdue';
    case 'В процессе': return 'status-progress';
    default: return 'status-notstarted';
  }
}

function canEditDutyTasks(factionId) {
  if (isSiteAdmin()) return true;
  if (role() === 'curator_assistant') return false;
  return isStaff() && curates(factionId) && can('editDutyTasks');
}

function canEditDutyArchive(factionId) {
  if (isSiteAdmin()) return true;
  if (isChiefOverseer() && curates(factionId)) return true;
  if (isStaff() && myLevel() >= 6 && curates(factionId)) return true;
  return false;
}

function canManageDutyTemplates(factionId) {
  if (isSiteAdmin()) return true;
  if (!isStaff() || !curates(factionId)) return false;
  // Помощник куратора может работать с назначенными обязанностями, но шаблоны
  // изменять не может ни через UI, ни через прямой вызов функции.
  if (role() === 'curator_assistant') return false;
  if (role() === 'curator') return can('editDutyTasks');
  if (role() === 'chief_overseer' || role() === 'server_admin') return can('manageDuties');
  return false;
}

async function renderDutyTable() {
  const container = document.getElementById('dutyTableContainer');
  if (!container) return;

  if (_unsubscribers.length) {
    _unsubscribers.forEach(unsub => unsub());
    _unsubscribers = [];
  }

  const weekStart = _selectedWeekStart;
  const weekEnd = getWeekEnd(weekStart);
  const locked = isWeekLocked(weekStart);
  const factionIds = getFactionsForDuties();
  let visibleFactions = factionIds;
  if (_factionFilter) {
    visibleFactions = factionIds.filter(id => id === _factionFilter);
  }

  if (!visibleFactions.length) {
    container.innerHTML = emptyState('Нет фракций для отображения.');
    return;
  }

  if (!isSiteAdmin() && isStaff()) {
    const myFactions = curatedFactions();
    myFactions.forEach(fid => {
      if (!_curatorUsers[fid]) _curatorUsers[fid] = [];
      const existing = _curatorUsers[fid].find(c => c.uid === state.user.uid);
      if (!existing) {
        _curatorUsers[fid].push({ uid: state.user.uid, ...state.user });
        _curatorUsers[fid].sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'ru'));
      }
    });
  }

  const weekDocs = {};
  try {
    for (const fid of visibleFactions) {
      const docId = `${fid}_${weekStart.toISOString().slice(0,10)}`;
      let doc = await db.collection('dutyWeeks').doc(docId).get();
      let data = doc.exists ? doc.data() : null;

      if (!data) {
        if (locked) {
          data = {
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            factionId: fid,
            tasks: [],
            locked: true
          };
        } else {
          let tasksTemplate = _dutyTemplates[fid] && _dutyTemplates[fid].length ? _dutyTemplates[fid] : (DUTY_DEFAULTS[fid] || DEFAULT_DUTY_TASKS);
          const tasks = tasksTemplate.map(name => ({
            id: randomId(),
            name,
            assignees: [],
            completedBy: []
          }));
          data = {
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            factionId: fid,
            tasks: tasks,
            locked: locked,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          };
          await db.collection('dutyWeeks').doc(docId).set(data);
        }
      } else if (data.tasks && data.tasks.length === 0 && !locked) {
        let tasksTemplate = _dutyTemplates[fid] && _dutyTemplates[fid].length ? _dutyTemplates[fid] : (DUTY_DEFAULTS[fid] || DEFAULT_DUTY_TASKS);
        const tasks = tasksTemplate.map(name => ({
          id: randomId(),
          name,
          assignees: [],
          completedBy: []
        }));
        await db.collection('dutyWeeks').doc(docId).update({
          tasks,
          updatedAt: FieldValue.serverTimestamp()
        });
        data.tasks = tasks;
      }

      weekDocs[fid] = { id: docId, data };
      _dutyWeeks[docId] = data;

      const unsub = db.collection('dutyWeeks').doc(docId).onSnapshot(snap => {
        if (snap.exists) {
          weekDocs[fid].data = snap.data();
          _dutyWeeks[docId] = snap.data();
          renderDutyTableUI(weekDocs, weekStart, locked);
        }
      });
      _unsubscribers.push(unsub);
    }
  } catch (err) {
    console.error('Ошибка загрузки/создания документов недели', err);
    container.innerHTML = errorState('Не удалось загрузить данные. ' + humanError(err), 'retry-duties');
    return;
  }

  renderDutyTableUI(weekDocs, weekStart, locked);
}

function renderDutyTableUI(weekDocs, weekStart, locked) {
  const container = document.getElementById('dutyTableContainer');
  if (!container) return;

  const visibleFactions = Object.keys(weekDocs);
  if (!visibleFactions.length) {
    container.innerHTML = emptyState('Нет фракций для отображения.');
    return;
  }

  let html = '';
  for (const fid of visibleFactions) {
    const doc = weekDocs[fid];
    if (!doc) continue;
    const tasks = doc.data.tasks || [];
    const curators = getCuratorUsersForFaction(fid);
    const factionNameStr = factionChipHtml(fid);
    const isLocked = locked || doc.data.locked === true;

    const canEditTasks = isLocked ? canEditDutyArchive(fid) : canEditDutyTasks(fid);
    const canManageTemplate = canManageDutyTemplates(fid);

    if (!tasks.length && !canEditTasks) {
      html += `<div class="duty-faction-block">
        <h3 class="duty-faction-title">${factionNameStr} ${isLocked ? '<span class="badge badge-grey">Архив</span>' : ''}</h3>
        <div class="empty-state">Нет задач для этой фракции.</div>
      </div>`;
      continue;
    }

    const hasCurators = curators.length > 0;
    const doneCount = tasks.filter(t => getTaskStatus(t, weekStart) === 'Выполнено').length;
    const progressText = `${doneCount}/${tasks.length} выполнено`;

    html += `<div class="duty-faction-block">
      <h3 class="duty-faction-title">
        ${factionNameStr}
        <span class="duty-progress">${progressText}</span>
        ${isLocked ? '<span class="badge badge-grey">Архив</span>' : ''}
        ${canManageTemplate ? `<button class="btn btn-ghost btn-sm duty-template-btn" data-faction="${escapeHtml(fid)}">Шаблон</button>` : ''}
      </h3>
      <div class="duty-table-wrap">
        <table class="duty-table">
          <thead>
            <tr>
              <th class="duty-task-col">Задача</th>
              <th class="duty-admin-col">Администратор</th>
              <th class="duty-status-col">Статус</th>
              <th class="duty-action-col">Действия</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map(task => {
              const assignees = task.assignees || [];
              const completedBy = task.completedBy || [];
              const status = getTaskStatus(task, weekStart);
              const statusClass = statusBadgeClass(status);
              const currentUserAssigned = assignees.includes(state.user.uid);
              const isDone = completedBy.includes(state.user.uid);
              const canToggleDone = currentUserAssigned && !isLocked;

              const assigneeNames = assignees.length
                ? assignees.map(uid => dutyUserName(uid)).join(', ')
                : '—';

              const curatorOptions = hasCurators
                ? curators.map(c => {
                    const selected = assignees.includes(c.uid);
                    const allowed = canAssignDutyUser(fid, c.uid);
                    return `<div class="dropdown-option${selected ? ' selected' : ''}${allowed ? '' : ' disabled'}" data-value="${escapeHtml(c.uid)}" aria-disabled="${allowed ? 'false' : 'true'}">${escapeHtml(c.displayName || c.email || 'Пользователь')}</div>`;
                  }).join('')
                : '<div class="dropdown-option disabled" data-value="" aria-disabled="true">Нет кураторов</div>';

              let assigneesCell;
              if (isLocked) {
                assigneesCell = `<div class="duty-static-cell">${escapeHtml(assigneeNames)}</div>`;
              } else {
                assigneesCell = `
                  <div class="custom-dropdown" data-faction="${escapeHtml(fid)}" data-week="${escapeHtml(doc.id)}" data-task-id="${escapeHtml(task.id)}">
                    <div class="dropdown-display">${assigneeNames !== '—' ? escapeHtml(assigneeNames) : 'Выберите администратора'}</div>
                    <div class="dropdown-options">
                      ${curatorOptions}
                    </div>
                  </div>`;
              }

              return `<tr>
                <td class="duty-task-name">${escapeHtml(task.name)}</td>
                <td class="duty-assign-cell">${assigneesCell}</td>
                <td class="duty-status-col">
                  <span class="duty-status-badge ${statusClass}">${status}</span>
                </td>
                <td class="duty-action-col">
                  <button class="duty-toggle-done${isDone ? ' done' : ''}" data-faction="${escapeHtml(fid)}" data-week="${escapeHtml(doc.id)}" data-task-id="${escapeHtml(task.id)}" ${canToggleDone ? '' : 'disabled'}>
                    ${isDone ? '✓ Выполнено' : 'Отметить'}
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  container.innerHTML = html;
  const weekLabelEl = document.getElementById('dutyWeekLabel');
  if (weekLabelEl) weekLabelEl.textContent = weekLabel(weekStart);

  container.querySelectorAll('.custom-dropdown').forEach(dropdown => {
    const display = dropdown.querySelector('.dropdown-display');
    const options = dropdown.querySelector('.dropdown-options');
    const factionId = dropdown.dataset.faction;
    const weekId = dropdown.dataset.week;
    const taskId = dropdown.dataset.taskId;
    let selectedUids = new Set(
      Array.from(dropdown.querySelectorAll('.dropdown-option.selected')).map(opt => opt.dataset.value)
    );

    display.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdownOptions(options);
      if (isWeekLocked(weekStart)) {
        toast('Нельзя редактировать прошедшую неделю', 'error');
        options.classList.remove('open');
        return;
      }
    });

    options.querySelectorAll('.dropdown-option').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isWeekLocked(weekStart)) {
          toast('Нельзя редактировать прошедшую неделю', 'error');
          return;
        }
        const uid = opt.dataset.value;
        if (!uid) return;
        if (!canAssignDutyUser(factionId, uid)) {
          toast('У вас нет права назначать этого администратора', 'error');
          return;
        }
        if (selectedUids.has(uid)) {
          selectedUids.delete(uid);
          opt.classList.remove('selected');
        } else {
          if (selectedUids.size >= 2) {
            toast('Можно назначить не более двух администраторов', 'error');
            return;
          }
          selectedUids.add(uid);
          opt.classList.add('selected');
        }
        display.textContent = selectedUids.size
          ? Array.from(selectedUids).map(v => dutyUserName(v)).join(', ')
          : 'Выберите администратора';
        options.classList.remove('open');

        dropdown.classList.add('saving');
        display.textContent = 'Сохранение...';
        try {
          await updateAssignees(factionId, weekId, taskId, Array.from(selectedUids));
        } finally {
          dropdown.classList.remove('saving');
        }
      });
    });
  });

  container.querySelectorAll('.duty-toggle-done').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      if (isWeekLocked(weekStart)) {
        toast('Нельзя отмечать выполнение на прошедшей неделе', 'error');
        return;
      }
      const factionId = btn.dataset.faction;
      const weekId = btn.dataset.week;
      const taskId = btn.dataset.taskId;
      await toggleTaskDone(factionId, weekId, taskId);
    });
  });

  container.querySelectorAll('.duty-template-btn').forEach(btn => {
    btn.addEventListener('click', () => openDutyTemplateModal(btn.dataset.faction));
  });
}

async function updateAssignees(factionId, weekId, taskId, newAssignees) {
  if (isWeekLocked(_selectedWeekStart)) {
    toast('Нельзя редактировать прошедшую неделю', 'error');
    return;
  }
  const weekRef = db.collection('dutyWeeks').doc(weekId);
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(weekRef);
      if (!doc.exists) throw new Error('Документ недели не найден');
      const data = doc.data();
      const tasks = data.tasks || [];
      const task = tasks.find(t => t.id === taskId);
      if (!task) throw new Error('Задача не найдена');
      const oldAssignees = Array.isArray(task.assignees) ? task.assignees : [];
      const changedUsers = [...new Set([...oldAssignees, ...newAssignees])].filter(uid => oldAssignees.includes(uid) !== newAssignees.includes(uid));
      if (changedUsers.some(uid => !canAssignDutyUser(factionId, uid))) throw new Error('Нет права менять назначение этого администратора');
      task.assignees = newAssignees;
      task.completedBy = (Array.isArray(task.completedBy) ? task.completedBy : []).filter(id => newAssignees.includes(id));
      transaction.update(weekRef, { tasks, updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    failToast(err, 'Не удалось обновить назначения');
    throw err;
  }
}

async function toggleTaskDone(factionId, weekId, taskId) {
  if (isWeekLocked(_selectedWeekStart)) {
    toast('Нельзя отмечать выполнение на прошедшей неделе', 'error');
    return;
  }
  const weekRef = db.collection('dutyWeeks').doc(weekId);
  const uid = state.user.uid;
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(weekRef);
      if (!doc.exists) throw new Error('Документ недели не найден');
      const data = doc.data();
      const tasks = data.tasks || [];
      const task = tasks.find(t => t.id === taskId);
      if (!task) throw new Error('Задача не найдена');
      let completedBy = task.completedBy || [];
      if (completedBy.includes(uid)) {
        completedBy = completedBy.filter(id => id !== uid);
      } else {
        completedBy.push(uid);
      }
      task.completedBy = completedBy;
      transaction.update(weekRef, { tasks, updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    failToast(err, 'Не удалось изменить статус выполнения');
  }
}

async function openDutyTaskEditorModal(initialFactionId = null) {
  const editableFactions = getFactionsForDuties().filter(fid => canEditDutyTasks(fid));
  if (!editableFactions.length) {
    toast('У вас нет права редактировать задачи', 'error');
    return;
  }

  let factionId = editableFactions.includes(initialFactionId) ? initialFactionId
    : (editableFactions.includes(_factionFilter) ? _factionFilter : editableFactions[0]);

  const weekIdFor = fid => `${fid}_${_selectedWeekStart.toISOString().slice(0,10)}`;
  const loadWeekData = async fid => {
    const weekId = weekIdFor(fid);
    if (_dutyWeeks[weekId]) return {weekId, data: _dutyWeeks[weekId]};
    const snap = await db.collection('dutyWeeks').doc(weekId).get();
    return {weekId, data: snap.exists ? snap.data() : null};
  };

  openModal(`
    <div class="duty-task-editor-head">
      <div>
        <h2>Редактировать задачи</h2>
        <p class="sub">Задачи текущей недели и пользовательский пул собраны в одном месте.</p>
      </div>
      <select id="dutyTaskEditorFaction" class="select-inline" aria-label="Фракция для редактирования">
        ${editableFactions.map(fid => `<option value="${escapeHtml(fid)}" ${fid === factionId ? 'selected' : ''}>${escapeHtml(factionName(fid))}</option>`).join('')}
      </select>
    </div>
    <div id="dutyTaskEditorBody" class="duty-task-editor-body"><div class="hint">Загрузка…</div></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="modal-close">Закрыть</button></div>`);

  document.querySelector('.modal')?.classList.add('duty-task-editor-modal');
  const body = document.getElementById('dutyTaskEditorBody');
  const factionSelect = document.getElementById('dutyTaskEditorFaction');

  const renderBody = async () => {
    if (!body || !canEditDutyTasks(factionId)) return;
    body.innerHTML = '<div class="hint">Загрузка…</div>';
    let week;
    try {
      week = await loadWeekData(factionId);
    } catch (err) {
      body.innerHTML = errorState('Не удалось загрузить неделю. ' + humanError(err));
      return;
    }
    const locked = isWeekLocked(_selectedWeekStart) || week.data?.locked === true;
    const currentTaskNames = Array.isArray(week.data?.tasks) ? week.data.tasks.map(t => t.name) : [];
    const availableTasks = availableDutyTasks(factionId);
    const poolRows = _dutyTaskPoolDocs.filter(t => t.active !== false && (!t.factionId || t.factionId === factionId));

    body.innerHTML = `
      <section class="duty-editor-section">
        <div class="duty-editor-section-head">
          <div><h3>Задачи недели</h3><div class="hint">${escapeHtml(weekLabel(_selectedWeekStart))}</div></div>
          ${locked ? '<span class="badge badge-grey">Архив</span>' : ''}
        </div>
        <div class="duty-task-choice-list" id="dutyWeekTaskChoices">
          ${availableTasks.map(name => `<label class="duty-task-choice"><input type="checkbox" value="${escapeHtml(name)}" ${currentTaskNames.includes(name) ? 'checked' : ''} ${locked && !canEditDutyArchive(factionId) ? 'disabled' : ''}><span class="duty-task-choice-mark" aria-hidden="true"></span><span>${escapeHtml(name)}</span></label>`).join('') || '<div class="empty-state">Нет доступных задач.</div>'}
        </div>
        <div class="duty-editor-inline-actions">
          <button type="button" class="btn btn-primary" id="saveDutyWeekTasksBtn" ${locked && !canEditDutyArchive(factionId) ? 'disabled' : ''}>Сохранить задачи недели</button>
        </div>
      </section>

      <section class="duty-editor-section">
        <div class="duty-editor-section-head"><div><h3>Добавить задачу</h3><div class="hint">Пользовательские задачи появляются в общем списке выбора. Системные задачи здесь не удаляются.</div></div></div>
        <div class="duty-pool-create">
          <label class="duty-pool-name-field" for="dutyPoolName"><span>Название</span><input id="dutyPoolName" maxlength="120" minlength="3" autocomplete="off" placeholder="Например: Проверить отчёты подразделения"><small id="dutyPoolNameHint">От 3 до 120 символов</small></label>
          <label class="duty-pool-scope-field" for="dutyPoolFaction"><span>Доступна для</span><select id="dutyPoolFaction" class="select-inline"><option value="">Всех курируемых фракций</option>${editableFactions.map(fid => `<option value="${escapeHtml(fid)}" ${fid === factionId ? 'selected' : ''}>${escapeHtml(factionName(fid))}</option>`).join('')}</select></label>
          <button type="button" class="btn btn-primary" id="dutyPoolAdd">Добавить</button>
        </div>
        <div class="duty-pool-list" id="dutyPoolList">
          ${poolRows.length ? poolRows.map(t => `<div class="duty-pool-row"><div><b>${escapeHtml(t.name)}</b><span>${t.factionId ? escapeHtml(factionName(t.factionId)) : 'Все курируемые фракции'}</span></div><button type="button" class="btn btn-ghost btn-sm duty-pool-delete" data-id="${escapeHtml(t.id)}">Удалить</button></div>`).join('') : '<div class="empty-state">Пользовательских задач для этой фракции пока нет.</div>'}
        </div>
      </section>`;

    const nameInput = document.getElementById('dutyPoolName');
    const nameHint = document.getElementById('dutyPoolNameHint');
    const validateName = () => {
      const len = (nameInput?.value || '').trim().length;
      const valid = len >= 3 && len <= 120;
      nameInput?.classList.toggle('invalid', len > 0 && !valid);
      if (nameHint) nameHint.textContent = len ? `${len}/120${valid ? '' : ' · минимум 3 символа'}` : 'От 3 до 120 символов';
      return valid;
    };
    nameInput?.addEventListener('input', validateName);
    nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('dutyPoolAdd')?.click(); });

    document.getElementById('saveDutyWeekTasksBtn')?.addEventListener('click', async e => {
      if (!week.data) { toast('Неделя ещё не создана. Обновите раздел и повторите попытку.', 'error'); return; }
      const selectedNames = Array.from(document.querySelectorAll('#dutyWeekTaskChoices input:checked')).map(el => el.value);
      if (!selectedNames.length) { toast('Выберите хотя бы одну задачу', 'error'); return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await updateWeekTasks(factionId, week.weekId, selectedNames);
        toast('Задачи недели сохранены');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('dutyPoolAdd')?.addEventListener('click', async e => {
      const name = (nameInput?.value || '').trim();
      const targetFactionId = document.getElementById('dutyPoolFaction')?.value || null;
      if (!validateName()) { toast('Введите название задачи от 3 до 120 символов', 'error'); nameInput?.focus(); return; }
      const duplicateScope = targetFactionId || factionId;
      if (availableDutyTasks(duplicateScope).some(t => t.toLowerCase() === name.toLowerCase())) { toast('Такая задача уже есть', 'error'); return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await db.collection('dutyTaskPool').add({name, factionId: targetFactionId, active: true, createdBy: state.user.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
        toast('Задача добавлена');
        if (nameInput) nameInput.value = '';
        await new Promise(resolve => setTimeout(resolve, 0));
        renderBody();
      } catch (err) {
        btn.disabled = false;
        failToast(err, 'Не удалось добавить задачу');
      }
    });

    body.querySelectorAll('.duty-pool-delete').forEach(btn => btn.addEventListener('click', async () => {
      const item = _dutyTaskPoolDocs.find(t => t.id === btn.dataset.id);
      if (!item || (item.factionId && !canEditDutyTasks(item.factionId))) { toast('Нет права удалить эту задачу', 'error'); return; }
      const ok = await confirmDialog({title: 'Удалить пользовательскую задачу?', text: 'Она исчезнет из списков выбора, но уже сохранённые обязанности останутся без изменений.', okText: 'Удалить', danger: true});
      if (!ok) return;
      btn.disabled = true;
      try {
        await db.collection('dutyTaskPool').doc(item.id).update({active: false, updatedAt: FieldValue.serverTimestamp()});
        toast('Задача удалена из пула');
        renderBody();
      } catch (err) {
        btn.disabled = false;
        failToast(err, 'Не удалось удалить задачу');
      }
    }));
  };

  factionSelect?.addEventListener('change', () => {
    factionId = factionSelect.value;
    renderBody();
  });
  await renderBody();
}

// Старое имя оставлено только для совместимости со старыми вызовами.
function openEditTasksModal(factionId) {
  return openDutyTaskEditorModal(factionId);
}

async function updateWeekTasks(factionId, weekId, newTaskNames) {
  if (isWeekLocked(_selectedWeekStart) && !canEditDutyArchive(factionId)) {
    toast('Нельзя редактировать архив', 'error');
    return;
  }
  if (!canEditDutyTasks(factionId) && !(isWeekLocked(_selectedWeekStart) && canEditDutyArchive(factionId))) {
    toast('У вас нет прав на редактирование задач', 'error');
    return;
  }
  const weekRef = db.collection('dutyWeeks').doc(weekId);
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(weekRef);
      if (!doc.exists) throw new Error('Документ недели не найден');
      const data = doc.data();
      const oldTasks = data.tasks || [];
      const newTasks = [];

      newTaskNames.forEach(name => {
        const existing = oldTasks.find(t => t.name === name);
        if (existing) {
          newTasks.push(existing);
        } else {
          newTasks.push({
            id: randomId(),
            name: name,
            assignees: [],
            completedBy: []
          });
        }
      });

      transaction.update(weekRef, { tasks: newTasks, updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    failToast(err, 'Не удалось обновить задачи');
  }
}

function openDutyTemplateModal(factionId) {
  if (!canManageDutyTemplates(factionId)) {
    toast('У вас нет прав на редактирование шаблона', 'error');
    return;
  }
  const currentDoc = _dutyTemplateDocs[factionId] || normalizeDutyTemplateDoc(factionId, {});
  const availableTasks = availableDutyTasks(factionId);
  const accessibleFactions = getFactionsForDuties().filter(fid => canManageDutyTemplates(fid));
  let activeTemplateId = currentDoc.activeTemplateId;
  let selectedTemplate = currentDoc.templates.find(t => t.id === activeTemplateId) || currentDoc.templates[0];
  let selectedTasks = new Set(selectedTemplate.tasks.filter(t => availableTasks.includes(t)));

  const taskOptions = () => availableTasks.map(task => {
    const selected = selectedTasks.has(task);
    return `<div class="dropdown-option${selected ? ' selected' : ''}" data-value="${escapeHtml(task)}">${escapeHtml(task)}</div>`;
  }).join('');

  const targetChecks = accessibleFactions.map(fid => `
    <label class="duty-target-check"><input type="checkbox" class="template-target" value="${escapeHtml(fid)}" ${fid === factionId ? 'checked' : ''}><span class="duty-target-mark" aria-hidden="true"></span><span>${escapeHtml(factionName(fid))}</span></label>`).join('');

  openModal(`
    <h2>Шаблоны обязанностей — ${escapeHtml(factionName(factionId))}</h2>
    <p class="sub">Сохраняйте несколько наборов, копируйте их между фракциями и выбирайте активный шаблон для следующей недели.</p>
    <div class="field">
      <label for="templateExisting">Сохранённый шаблон</label>
      <select id="templateExisting" class="select-inline duty-template-select">
        ${currentDoc.templates.map(t => `<option value="${escapeHtml(t.id)}" ${t.id === activeTemplateId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        <option value="__new__">+ Новый шаблон</option>
      </select>
    </div>
    <div class="field">
      <label for="templateName">Название</label>
      <input id="templateName" maxlength="80" value="${escapeHtml(selectedTemplate.name)}" placeholder="Например: Обычная неделя">
    </div>
    <div class="field">
      <label>Задачи</label>
      <div class="custom-dropdown modal-dropdown" id="templateDropdown">
        <div class="dropdown-display">${selectedTasks.size ? escapeHtml(Array.from(selectedTasks).join(', ')) : 'Выберите задачи'}</div>
        <div class="dropdown-options">${taskOptions()}</div>
      </div>
    </div>
    <div class="field">
      <div class="duty-template-target-head"><label>Применить к фракциям</label><button class="btn btn-ghost btn-sm" id="templateAllTargets" type="button">Применить ко всем курируемым</button></div>
      <div class="duty-template-targets">${targetChecks}</div>
    </div>
    <div class="duty-template-preview">
      <b>Предпросмотр следующей недели</b>
      <div id="templatePreview"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="saveTemplateBtn">Сохранить шаблон</button>
    </div>`);

  document.querySelector('.modal')?.classList.add('duty-template-modal');
  const existingSelect = document.getElementById('templateExisting');
  const nameInput = document.getElementById('templateName');
  const dropdown = document.getElementById('templateDropdown');
  const display = dropdown.querySelector('.dropdown-display');
  const options = dropdown.querySelector('.dropdown-options');
  const preview = document.getElementById('templatePreview');

  const renderPreview = () => {
    const next = new Date(_currentWeekStart || getWeekStart(getMoscowNow()));
    next.setDate(next.getDate() + 7);
    preview.innerHTML = `<div class="hint">Неделя ${escapeHtml(weekLabel(next))}</div>${selectedTasks.size ? `<ol>${Array.from(selectedTasks).map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ol>` : '<div class="hint">Задачи не выбраны.</div>'}`;
  };
  const bindTaskOptions = () => {
    options.innerHTML = taskOptions();
    options.querySelectorAll('.dropdown-option').forEach(opt => {
      opt.addEventListener('click', e => {
        e.stopPropagation();
        const val = opt.dataset.value;
        if (selectedTasks.has(val)) { selectedTasks.delete(val); opt.classList.remove('selected'); }
        else { selectedTasks.add(val); opt.classList.add('selected'); }
        display.textContent = selectedTasks.size ? Array.from(selectedTasks).join(', ') : 'Выберите задачи';
        renderPreview();
      });
    });
  };
  bindTaskOptions();
  renderPreview();

  display.addEventListener('click', e => {
    e.stopPropagation();
    toggleDropdownOptions(options);
    if (options.classList.contains('open')) {
      const rect = display.getBoundingClientRect();
      options.style.position = 'fixed';
      options.style.left = rect.left + 'px';
      options.style.top = rect.bottom + 'px';
      options.style.width = rect.width + 'px';
      options.style.maxHeight = '300px';
      options.style.overflowY = 'auto';
      options.style.zIndex = '1000';
    }
  });

  existingSelect.addEventListener('change', () => {
    if (existingSelect.value === '__new__') {
      activeTemplateId = `tpl_${randomId()}`;
      selectedTasks = new Set();
      nameInput.value = '';
    } else {
      activeTemplateId = existingSelect.value;
      selectedTemplate = currentDoc.templates.find(t => t.id === activeTemplateId) || currentDoc.templates[0];
      selectedTasks = new Set(selectedTemplate.tasks.filter(t => availableTasks.includes(t)));
      nameInput.value = selectedTemplate.name;
    }
    display.textContent = selectedTasks.size ? Array.from(selectedTasks).join(', ') : 'Выберите задачи';
    bindTaskOptions();
    renderPreview();
  });

  document.getElementById('templateAllTargets')?.addEventListener('click', () => {
    document.querySelectorAll('.template-target').forEach(el => { el.checked = true; });
  });

  document.getElementById('saveTemplateBtn').addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const tasks = Array.from(selectedTasks);
    const targetIds = Array.from(document.querySelectorAll('.template-target:checked')).map(el => el.value);
    if (!name) { toast('Введите название шаблона', 'error'); return; }
    if (!tasks.length) { toast('Выберите хотя бы одну задачу', 'error'); return; }
    if (!targetIds.length) { toast('Выберите хотя бы одну фракцию', 'error'); return; }
    const ok = await saveDutyTemplateMulti(targetIds, activeTemplateId, name, tasks);
    if (ok) closeModal();
  });
}

async function saveDutyTemplateMulti(factionIds, templateId, templateName, tasks) {
  const targets = [...new Set(factionIds)].filter(fid => canManageDutyTemplates(fid));
  if (!targets.length) { toast('Нет доступных фракций для сохранения', 'error'); return false; }
  try {
    const batch = db.batch();
    targets.forEach(fid => {
      const current = _dutyTemplateDocs[fid] || normalizeDutyTemplateDoc(fid, {});
      const templates = current.templates.map(t => ({ id: t.id, name: t.name, tasks: [...t.tasks] }));
      const idx = templates.findIndex(t => t.id === templateId);
      const entry = { id: templateId, name: templateName, tasks };
      if (idx >= 0) templates[idx] = entry; else templates.push(entry);
      const ref = db.collection('dutyTemplates').doc(fid);
      batch.set(ref, { tasks, templates, activeTemplateId: templateId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    await batch.commit();
    targets.forEach(fid => {
      const current = _dutyTemplateDocs[fid] || normalizeDutyTemplateDoc(fid, {});
      const templates = current.templates.filter(t => t.id !== templateId).concat([{ id: templateId, name: templateName, tasks }]);
      _dutyTemplateDocs[fid] = { templates, activeTemplateId: templateId, tasks };
      _dutyTemplates[fid] = tasks;
    });
    toast(targets.length > 1 ? `Шаблон применён к ${targets.length} фракциям` : 'Шаблон сохранён');
    return true;
  } catch (err) {
    failToast(err, 'Не удалось сохранить шаблон');
    return false;
  }
}

function openDutyTaskPoolModal() {
  return openDutyTaskEditorModal(_factionFilter);
}

function dutyTrendChartHtml(trend) {
  const points = Array.isArray(trend) ? trend : [];
  if (!points.length) return '<div class="duty-chart-empty hint">Недостаточно данных для графика.</div>';
  const maxValue = Math.max(1, ...points.flatMap(p => [p.done || 0, p.overdue || 0]));
  return `<div class="duty-chart-card">
    <div class="duty-chart-head">
      <div>
        <h3>Динамика по неделям</h3>
        <div class="hint">Выполненные и просроченные назначения по доступным фракциям</div>
      </div>
      <div class="duty-chart-legend"><span><i class="chart-legend-done"></i>Выполнено</span><span><i class="chart-legend-overdue"></i>Просрочено</span></div>
    </div>
    <div class="duty-chart-scroll">
      <div class="duty-chart" style="--chart-points:${points.length}">
        ${points.map(p => {
          const doneHeight = Math.max(p.done ? 8 : 0, Math.round((p.done || 0) / maxValue * 100));
          const overdueHeight = Math.max(p.overdue ? 8 : 0, Math.round((p.overdue || 0) / maxValue * 100));
          const label = String(p.date || '').split('-').slice(1).reverse().join('.');
          return `<div class="duty-chart-column" title="Неделя ${escapeHtml(p.date)}: выполнено ${p.done || 0}, просрочено ${p.overdue || 0}">
            <div class="duty-chart-values"><span>${p.done || 0}</span><span>${p.overdue || 0}</span></div>
            <div class="duty-chart-bars">
              <i class="duty-bar duty-bar-done" style="height:${doneHeight}%"></i>
              <i class="duty-bar duty-bar-overdue" style="height:${overdueHeight}%"></i>
            </div>
            <div class="duty-chart-label">${escapeHtml(label)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

async function loadStatistics() {
  const container = document.getElementById('dutyTableContainer');
  if (!container) return;

  const factionIds = getFactionsForDuties();
  if (!factionIds.length) {
    container.innerHTML = emptyState('Нет доступных фракций.');
    return;
  }

  if (_dutyStatsUnsub) { _dutyStatsUnsub(); _dutyStatsUnsub = null; }
  container.innerHTML = skeletonRows(5);

  const query = db.collection('dutyWeeks').where('factionId', 'in', factionIds.slice(0, 30));
  _dutyStatsUnsub = query.onSnapshot(async snap => {
    if (state.tab !== 'duties' || _dutySubTab !== 'stats') return;
    try {
      const now = getMoscowNow();
      const startDate = new Date(now);
      if (_statisticsMode === 'month') startDate.setDate(startDate.getDate() - 30);
      else startDate.setFullYear(2000);
      const startISO = startDate.toISOString().slice(0,10);
      const endISO = now.toISOString().slice(0,10);

      const factionStats = {};
      const weeklyTrend = {};
      let totalDone = 0;
      let totalOverdue = 0;
      let totalPending = 0;
      factionIds.forEach(fid => { factionStats[fid] = { tasks: new Set(), users: {} }; });
      const ensureStat = (fid, uid, taskName) => {
        if (!factionStats[fid].users[uid]) factionStats[fid].users[uid] = {};
        if (!factionStats[fid].users[uid][taskName]) factionStats[fid].users[uid][taskName] = { done: 0, overdue: 0 };
        return factionStats[fid].users[uid][taskName];
      };

      snap.forEach(doc => {
        const data = doc.data();
        if (!Array.isArray(data.tasks)) return;
        const fid = data.factionId;
        if (!factionStats[fid]) return;
        const weekStartISO = String(data.weekStart || '').slice(0,10);
        if (!weekStartISO || weekStartISO < startISO || weekStartISO > endISO) return;
        const weekEnd = data.weekEnd ? new Date(data.weekEnd) : getWeekEnd(new Date(data.weekStart));
        const isPast = weekEnd < now;

        data.tasks.forEach(task => {
          const name = task.name || 'Без названия';
          factionStats[fid].tasks.add(name);
          const assignees = [...new Set(Array.isArray(task.assignees) ? task.assignees : [])];
          const completedBy = [...new Set(Array.isArray(task.completedBy) ? task.completedBy : [])];
          if (!weeklyTrend[weekStartISO]) weeklyTrend[weekStartISO] = { date: weekStartISO, done: 0, overdue: 0 };
          assignees.forEach(uid => {
            const stat = ensureStat(fid, uid, name);
            if (completedBy.includes(uid)) {
              stat.done += 1;
              weeklyTrend[weekStartISO].done += 1;
              totalDone += 1;
            } else if (isPast) {
              stat.overdue += 1;
              weeklyTrend[weekStartISO].overdue += 1;
              totalOverdue += 1;
            } else {
              totalPending += 1;
            }
          });
          completedBy.filter(uid => !assignees.includes(uid)).forEach(uid => {
            ensureStat(fid, uid, name).done += 1;
            weeklyTrend[weekStartISO].done += 1;
            totalDone += 1;
          });
        });
      });

      const allUids = new Set();
      Object.values(factionStats).forEach(f => Object.keys(f.users).forEach(uid => allUids.add(uid)));
      const uidArray = Array.from(allUids);
      const userMap = {};
      Object.values(_curatorUsers).flat().forEach(u => {
        if (u?.uid) userMap[u.uid] = u.displayName || u.email || u.uid;
      });
      if (state.user?.uid) userMap[state.user.uid] = state.user.displayName || state.user.email || state.user.uid;

      // Пользователи с отдельным правом «Просмотр пользователей» (и менеджеры)
      // могут разрешённо дополнить имена исторических исполнителей. Для остальных
      // статистика не расширяет доступ к каталогу пользователей.
      if (canViewUsers()) {
        const missing = uidArray.filter(uid => !userMap[uid]);
        for (let i = 0; i < missing.length; i += 30) {
          const chunk = missing.slice(i, i + 30);
          if (!chunk.length) continue;
          const usersSnap = await db.collection('users').where('uid', 'in', chunk).get();
          usersSnap.forEach(doc => {
            const data = doc.data();
            userMap[doc.id] = data.displayName || data.email || 'Пользователь';
          });
        }
      }

      const trendPoints = Object.values(weeklyTrend)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(_statisticsMode === 'all' ? -12 : -6);
      const evaluated = totalDone + totalOverdue;
      const successRate = evaluated ? Math.round(totalDone / evaluated * 100) : 0;

      let html = `<div class="toolbar duty-stats-toolbar">
        <div class="toolbar-note">Статистика: выполнено и индивидуальные просрочки</div>
        <div class="toolbar-right">
          <button class="btn btn-sm ${_statisticsMode === 'month' ? 'btn-primary' : ''}" id="statsMonthBtn">Последние 30 дней</button>
          <button class="btn btn-sm ${_statisticsMode === 'all' ? 'btn-primary' : ''}" id="statsAllBtn">За всё время</button>
        </div>
      </div>
      <div class="duty-summary-grid">
        <div class="duty-summary-card"><span>Выполнено</span><b class="stat-done">${totalDone}</b></div>
        <div class="duty-summary-card"><span>Просрочено</span><b class="stat-overdue">${totalOverdue}</b></div>
        <div class="duty-summary-card"><span>В работе</span><b>${totalPending}</b></div>
        <div class="duty-summary-card"><span>Результативность</span><b>${successRate}%</b></div>
      </div>
      ${dutyTrendChartHtml(trendPoints)}`;

      let hasBlocks = false;
      for (const fid of Object.keys(factionStats)) {
        const f = factionStats[fid];
        if (f.tasks.size === 0 && Object.keys(f.users).length === 0) continue;
        hasBlocks = true;
        const taskNames = Array.from(f.tasks).sort((a,b) => a.localeCompare(b, 'ru'));
        const users = Object.keys(f.users).sort((a,b) => String(userMap[a] || 'Пользователь').localeCompare(String(userMap[b] || 'Пользователь'), 'ru'));
        html += `<div class="duty-faction-block"><h3 class="duty-faction-title">${factionChipHtml(fid)}</h3>`;
        if (!users.length) {
          html += `<div class="empty-state">Нет назначений за выбранный период.</div></div>`;
          continue;
        }
        html += `<div class="duty-table-wrap table-scroll-shell"><table class="duty-table duty-stats-table">
          <thead><tr><th>Администратор</th>${taskNames.map(name => `<th>${escapeHtml(name)}</th>`).join('')}<th>Выполнено</th><th>Просрочено</th></tr></thead><tbody>`;
        const totals = {};
        taskNames.forEach(name => totals[name] = {done:0, overdue:0});
        let grandDone = 0, grandOverdue = 0;
        users.forEach(uid => {
          let userDone = 0, userOverdue = 0;
          html += `<tr><td><b>${escapeHtml(userMap[uid] || 'Пользователь')}</b></td>`;
          taskNames.forEach(name => {
            const stat = f.users[uid][name] || {done:0, overdue:0};
            userDone += stat.done; userOverdue += stat.overdue;
            totals[name].done += stat.done; totals[name].overdue += stat.overdue;
            html += `<td><span class="stat-done" title="Выполнено">✓ ${stat.done}</span>${stat.overdue ? `<span class="stat-overdue" title="Просрочено">! ${stat.overdue}</span>` : ''}</td>`;
          });
          grandDone += userDone; grandOverdue += userOverdue;
          html += `<td><b class="stat-done">${userDone}</b></td><td><b class="stat-overdue">${userOverdue}</b></td></tr>`;
        });
        html += `<tr class="row-muted"><td><b>Итого</b></td>`;
        taskNames.forEach(name => html += `<td><span class="stat-done">✓ ${totals[name].done}</span>${totals[name].overdue ? `<span class="stat-overdue">! ${totals[name].overdue}</span>` : ''}</td>`);
        html += `<td><b>${grandDone}</b></td><td><b>${grandOverdue}</b></td></tr></tbody></table></div></div>`;
      }
      if (!hasBlocks) html += emptyState('Нет данных за выбранный период.');
      container.innerHTML = html;
      document.getElementById('statsMonthBtn')?.addEventListener('click', () => { _statisticsMode = 'month'; loadStatistics(); });
      document.getElementById('statsAllBtn')?.addEventListener('click', () => { _statisticsMode = 'all'; loadStatistics(); });
    } catch (err) {
      console.error('Статистика', err);
      if (container) container.innerHTML = errorState('Не удалось построить статистику. ' + humanError(err), 'retry-duties');
    }
  }, err => {
    console.error('Статистика', err);
    container.innerHTML = errorState('Не удалось загрузить статистику. ' + humanError(err), 'retry-duties');
  });
}

window.loadDuties = loadDuties;
window.openDutyTemplateModal = openDutyTemplateModal;
window.openDutyTaskEditorModal = openDutyTaskEditorModal;
