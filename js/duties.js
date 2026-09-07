let _dutyWeeks = {};
let _currentWeekStart = null;
let _selectedWeekStart = null;
let _factionFilter = null;
let _curatorUsers = {};
let _unsubscribers = [];
let _dutyTemplates = {};
let _dutySubTab = 'duties';
let _statisticsMode = 'current';

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

async function loadCuratorUsers() {
  _curatorUsers = {};
  try {
    let snap;
    if (isSiteAdmin()) {
      snap = await db.collection('users').where('systemRole', 'in', ['curator_assistant', 'curator']).get();
    } else if (isStaff()) {
      snap = await db.collection('users').where('systemRole', 'in', ['curator_assistant', 'curator']).get();
    } else {
      return;
    }
    const myFactions = curatedFactions();
    snap.forEach(d => {
      const u = d.data();
      const isCurator = u.systemRole === 'curator_assistant' || u.systemRole === 'curator';
      const isActive = u.active !== false && u.deleted !== true;
      if (isCurator && isActive) {
        const curated = Array.isArray(u.curatedFactions) ? u.curatedFactions : [];
        const factionsToAdd = isSiteAdmin() ? curated : curated.filter(fid => myFactions.includes(fid));
        factionsToAdd.forEach(fid => {
          if (!_curatorUsers[fid]) _curatorUsers[fid] = [];
          if (!_curatorUsers[fid].some(c => c.uid === d.id)) {
            _curatorUsers[fid].push({ uid: d.id, ...u });
          }
        });
      }
    });
    Object.keys(_curatorUsers).forEach(fid => {
      _curatorUsers[fid].sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'ru'));
    });
  } catch (err) {
    console.error('Загрузка кураторов', err);
  }
}

async function loadDutyTemplates() {
  _dutyTemplates = {};
  try {
    const snap = await db.collection('dutyTemplates').get();
    snap.forEach(d => { _dutyTemplates[d.id] = d.data().tasks || []; });
  } catch (err) {
    console.error('Шаблоны обязанностей', err);
  }
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

  _factionFilter = null;

  const now = getMoscowNow();
  _currentWeekStart = getWeekStart(now);
  if (!_selectedWeekStart || _selectedWeekStart > _currentWeekStart) {
    _selectedWeekStart = _currentWeekStart;
  }

  const weekNavHtml = _dutySubTab === 'duties' ? `
    <div class="duty-nav">
      <button class="btn btn-icon" id="dutyPrevWeek" title="Предыдущая неделя">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="duty-week-label" id="dutyWeekLabel">${weekLabel(_selectedWeekStart)}</span>
      <button class="btn btn-icon" id="dutyNextWeek" title="Следующая неделя">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <button class="btn btn-sm" id="dutyTodayBtn">Сегодня</button>
    </div>
    <div class="duty-filter">
      <select id="dutyFactionSelect" class="select-inline">
        <option value="">Все фракции</option>
        ${factionIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(factionName(id))}</option>`).join('')}
      </select>
    </div>
  ` : '';

  root.innerHTML = `
    <div class="duty-toolbar">
      <div class="duty-nav">
        <button class="btn btn-sm ${_dutySubTab === 'duties' ? 'btn-primary' : ''}" id="dutyTabBtn">Обязанности</button>
        <button class="btn btn-sm ${_dutySubTab === 'stats' ? 'btn-primary' : ''}" id="statsTabBtn">Статистика</button>
      </div>
      ${weekNavHtml}
    </div>
    <div id="dutyTableContainer"></div>
  `;

  document.getElementById('dutyTabBtn').addEventListener('click', () => {
    _dutySubTab = 'duties';
    loadDuties();
  });
  document.getElementById('statsTabBtn').addEventListener('click', () => {
    _dutySubTab = 'stats';
    loadDuties();
  });

  if (_dutySubTab === 'duties') {
    document.getElementById('dutyPrevWeek').addEventListener('click', () => {
      const d = new Date(_selectedWeekStart);
      d.setDate(d.getDate() - 7);
      _selectedWeekStart = getWeekStart(d);
      renderDutyTable();
    });
    document.getElementById('dutyNextWeek').addEventListener('click', () => {
      const candidate = new Date(_selectedWeekStart);
      candidate.setDate(candidate.getDate() + 7);
      const candidateStart = getWeekStart(candidate);
      if (candidateStart > _currentWeekStart) {
        toast('Нельзя перейти на будущую неделю', 'error');
        return;
      }
      _selectedWeekStart = candidateStart;
      renderDutyTable();
    });
    document.getElementById('dutyTodayBtn').addEventListener('click', () => {
      _selectedWeekStart = _currentWeekStart;
      renderDutyTable();
    });
    document.getElementById('dutyFactionSelect').addEventListener('change', (e) => {
      _factionFilter = e.target.value || null;
      renderDutyTable();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.dropdown-options.open').forEach(opt => opt.classList.remove('open'));
      }
    });

    await renderDutyTable();
  } else {
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
  if (completedBy.length === assignees.length) {
    return 'Выполнено';
  }
  if (completedBy.length > 0) {
    return 'В процессе';
  }
  if (now > weekEnd) {
    return 'Просрочено';
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
  if (!isStaff() || !curates(factionId)) return false;
  if ((role() === 'curator' || role() === 'server_admin') && can('manageDuties')) return true;
  return can('editDutyTasks');
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
  return role() === 'curator' || role() === 'server_admin';
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
    const factionNameStr = escapeHtml(factionName(fid));
    const isLocked = locked || doc.data.locked === true;

    const canEditTasks = isLocked ? canEditDutyArchive(fid) : (canEditDutyTasks(fid) || canManageDutyTemplates(fid));
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
        ${canEditTasks ? `<button class="btn btn-ghost btn-sm duty-edit-tasks" data-faction="${escapeHtml(fid)}" data-week="${escapeHtml(doc.id)}">Редактировать задачи</button>` : ''}
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
                ? assignees.map(uid => {
                    const curator = curators.find(c => c.uid === uid);
                    return curator ? (curator.displayName || curator.email) : uid;
                  }).join(', ')
                : '—';

              const curatorOptions = hasCurators
                ? curators.map(c => {
                    const selected = assignees.includes(c.uid);
                    return `<div class="dropdown-option${selected ? ' selected' : ''}" data-value="${escapeHtml(c.uid)}">${escapeHtml(c.displayName || c.email)}</div>`;
                  }).join('')
                : '<div class="dropdown-option" data-value="">Нет кураторов</div>';

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
                <td>${assigneesCell}</td>
                <td style="text-align:center;">
                  <span class="duty-status-badge ${statusClass}">${status}</span>
                </td>
                <td style="text-align:right;">
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
      document.querySelectorAll('.dropdown-options.open').forEach(opt => {
        if (opt !== options) opt.classList.remove('open');
      });
      options.classList.toggle('open');
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
          ? Array.from(selectedUids).map(v => {
              const curator = getCuratorUsersForFaction(factionId).find(c => c.uid === v);
              return curator ? (curator.displayName || curator.email) : v;
            }).join(', ')
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

  container.querySelectorAll('.duty-edit-tasks').forEach(btn => {
    btn.addEventListener('click', () => openEditTasksModal(btn.dataset.faction, btn.dataset.week));
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
      task.assignees = newAssignees;
      if (newAssignees.length === 0) task.completedBy = [];
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

function openEditTasksModal(factionId, weekId) {
  const weekData = _dutyWeeks[weekId];
  const currentTaskNames = weekData && weekData.tasks ? weekData.tasks.map(t => t.name) : [];
  const availableTasks = DUTY_TASK_POOL;

  const optionsHtml = availableTasks.map(task => {
    const selected = currentTaskNames.includes(task);
    return `<div class="dropdown-option${selected ? ' selected' : ''}" data-value="${escapeHtml(task)}">${escapeHtml(task)}</div>`;
  }).join('');

  openModal(`
    <h2>Редактирование задач — ${escapeHtml(factionName(factionId))}</h2>
    <p class="sub">Выберите задачи для этой недели</p>
    <div class="field">
      <div class="custom-dropdown modal-dropdown" id="editTasksDropdown">
        <div class="dropdown-display">${currentTaskNames.length ? escapeHtml(currentTaskNames.join(', ')) : 'Выберите задачи'}</div>
        <div class="dropdown-options">
          ${optionsHtml}
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="saveEditTasksBtn">Сохранить</button>
    </div>`);

  document.querySelector('.modal').classList.add('modal-no-overflow');

  const dropdown = document.getElementById('editTasksDropdown');
  const display = dropdown.querySelector('.dropdown-display');
  const options = dropdown.querySelector('.dropdown-options');
  let selectedTasks = new Set(currentTaskNames);

  options.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      if (selectedTasks.has(val)) {
        selectedTasks.delete(val);
        opt.classList.remove('selected');
      } else {
        selectedTasks.add(val);
        opt.classList.add('selected');
      }
      display.textContent = selectedTasks.size ? Array.from(selectedTasks).join(', ') : 'Выберите задачи';
    });
  });

  display.addEventListener('click', (e) => {
    e.stopPropagation();
    options.classList.toggle('open');
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

  document.addEventListener('click', () => {
    options.classList.remove('open');
  });

  document.getElementById('saveEditTasksBtn').addEventListener('click', async () => {
    const selectedNames = Array.from(selectedTasks);
    if (!selectedNames.length) {
      toast('Выберите хотя бы одну задачу', 'error');
      return;
    }
    await updateWeekTasks(factionId, weekId, selectedNames);
    closeModal();
  });
}

async function updateWeekTasks(factionId, weekId, newTaskNames) {
  if (isWeekLocked(_selectedWeekStart) && !canEditDutyArchive(factionId)) {
    toast('Нельзя редактировать архив', 'error');
    return;
  }
  if (!canEditDutyTasks(factionId) && !canManageDutyTemplates(factionId)) {
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
  const currentTemplate = _dutyTemplates[factionId] || DUTY_DEFAULTS[factionId] || DEFAULT_DUTY_TASKS;
  const availableTasks = DUTY_TASK_POOL;

  const optionsHtml = availableTasks.map(task => {
    const selected = currentTemplate.includes(task);
    return `<div class="dropdown-option${selected ? ' selected' : ''}" data-value="${escapeHtml(task)}">${escapeHtml(task)}</div>`;
  }).join('');

  openModal(`
    <h2>Шаблон обязанностей — ${escapeHtml(factionName(factionId))}</h2>
    <p class="sub">Выберите задачи, которые будут автоматически добавляться каждую неделю</p>
    <div class="field">
      <div class="custom-dropdown modal-dropdown" id="templateDropdown">
        <div class="dropdown-display">${currentTemplate.length ? escapeHtml(currentTemplate.join(', ')) : 'Выберите задачи'}</div>
        <div class="dropdown-options">
          ${optionsHtml}
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="saveTemplateBtn">Сохранить</button>
    </div>`);

  document.querySelector('.modal').classList.add('modal-no-overflow');

  const dropdown = document.getElementById('templateDropdown');
  const display = dropdown.querySelector('.dropdown-display');
  const options = dropdown.querySelector('.dropdown-options');
  let selectedTasks = new Set(currentTemplate);

  options.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      if (selectedTasks.has(val)) {
        selectedTasks.delete(val);
        opt.classList.remove('selected');
      } else {
        selectedTasks.add(val);
        opt.classList.add('selected');
      }
      display.textContent = selectedTasks.size ? Array.from(selectedTasks).join(', ') : 'Выберите задачи';
    });
  });

  display.addEventListener('click', (e) => {
    e.stopPropagation();
    options.classList.toggle('open');
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

  document.addEventListener('click', () => {
    options.classList.remove('open');
  });

  document.getElementById('saveTemplateBtn').addEventListener('click', async () => {
    const selectedNames = Array.from(selectedTasks);
    if (!selectedNames.length) {
      toast('Выберите хотя бы одну задачу', 'error');
      return;
    }
    await saveDutyTemplate(factionId, selectedNames);
    closeModal();
  });
}

async function saveDutyTemplate(factionId, tasks) {
  if (!canManageDutyTemplates(factionId)) {
    toast('У вас нет прав на редактирование шаблона', 'error');
    return;
  }
  try {
    const ref = db.collection('dutyTemplates').doc(factionId);
    await ref.set({ tasks, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    _dutyTemplates[factionId] = tasks;
    toast('Шаблон сохранён');
  } catch (err) {
    failToast(err, 'Не удалось сохранить шаблон');
  }
}

async function loadStatistics() {
  const container = document.getElementById('dutyTableContainer');
  if (!container) return;

  const factionIds = getFactionsForDuties();
  if (!factionIds.length) {
    container.innerHTML = emptyState('Нет доступных фракций.');
    return;
  }

  container.innerHTML = skeletonRows(5);

  try {
    const now = getMoscowNow();
    const startDate = new Date(now);
    if (_statisticsMode === 'current') {
      startDate.setDate(startDate.getDate() - 30);
    } else {
      startDate.setFullYear(startDate.getFullYear() - 10);
    }

    const startISO = startDate.toISOString().slice(0,10);
    const endISO = now.toISOString().slice(0,10);

    const snap = await db.collection('dutyWeeks')
      .where('factionId', 'in', factionIds.slice(0, 30))
      .get();

    const factionStats = {};
    factionIds.forEach(fid => {
      factionStats[fid] = {
        tasks: new Set(),
        users: {}
      };
    });

    snap.forEach(doc => {
      const data = doc.data();
      if (!data.tasks) return;
      const fid = data.factionId;
      if (!factionStats[fid]) return;
      const weekStartISO = data.weekStart;
      if (weekStartISO < startISO || weekStartISO > endISO) return;
      data.tasks.forEach(task => {
        factionStats[fid].tasks.add(task.name);
        (task.completedBy || []).forEach(uid => {
          if (!factionStats[fid].users[uid]) factionStats[fid].users[uid] = {};
          if (!factionStats[fid].users[uid][task.name]) factionStats[fid].users[uid][task.name] = 0;
          factionStats[fid].users[uid][task.name]++;
        });
      });
    });

    const allUids = new Set();
    Object.values(factionStats).forEach(f => {
      Object.keys(f.users).forEach(uid => allUids.add(uid));
    });
    const uidArray = Array.from(allUids);
    const userMap = {};
    for (let i = 0; i < uidArray.length; i += 30) {
      const chunk = uidArray.slice(i, i + 30);
      const usersSnap = await db.collection('users').where('uid', 'in', chunk).get();
      usersSnap.forEach(doc => {
        const data = doc.data();
        userMap[doc.id] = data.displayName || data.email || doc.id;
      });
    }

    let html = `<div class="toolbar">
      <div class="toolbar-note">Статистика выполненых задач за ${_statisticsMode === 'current' ? 'последние 30 дней' : 'всё время'}</div>
      <div class="toolbar-right">
        ${canViewDutyArchiveStats() ? `<button class="btn btn-sm ${_statisticsMode === 'current' ? '' : 'btn-primary'}" id="statsArchiveBtn">Архив</button>` : ''}
        <button class="btn btn-sm ${_statisticsMode === 'current' ? 'btn-primary' : ''}" id="statsCurrentBtn">Текущий месяц</button>
      </div>
    </div>`;

    for (const fid of Object.keys(factionStats)) {
      const f = factionStats[fid];
      if (f.tasks.size === 0 && Object.keys(f.users).length === 0) {
        continue;
      }
      const factionLabel = factionName(fid);
      const taskNames = Array.from(f.tasks).sort();
      const users = Object.keys(f.users);
      if (users.length === 0) {
        html += `<div class="duty-faction-block">
          <h3 class="duty-faction-title">${escapeHtml(factionLabel)}</h3>
          <div class="empty-state">Нет выполненных задач за выбранный период.</div>
        </div>`;
        continue;
      }

      html += `<div class="duty-faction-block">
        <h3 class="duty-faction-title">${escapeHtml(factionLabel)}</h3>
        <div class="duty-table-wrap">
          <table class="duty-table">
            <thead>
              <tr>
                <th>Администратор</th>
                ${taskNames.map(name => `<th>${escapeHtml(name)}</th>`).join('')}
                <th>Итого</th>
              </tr>
            </thead>
            <tbody>`;

      let totalByTask = {};
      taskNames.forEach(name => totalByTask[name] = 0);

      users.forEach(uid => {
        const userName = userMap[uid] || uid;
        let userTotal = 0;
        html += `<tr><td><b>${escapeHtml(userName)}</b></td>`;
        taskNames.forEach(name => {
          const count = f.users[uid][name] || 0;
          userTotal += count;
          totalByTask[name] += count;
          html += `<td>${count}</td>`;
        });
        html += `<td><b>${userTotal}</b></td></tr>`;
      });

      html += `<tr class="row-muted"><td><b>Итого</b></td>`;
      let grandTotal = 0;
      taskNames.forEach(name => {
        const sum = totalByTask[name] || 0;
        grandTotal += sum;
        html += `<td><b>${sum}</b></td>`;
      });
      html += `<td><b>${grandTotal}</b></td></tr>`;

      html += `</tbody></table></div></div>`;
    }

    if (html.indexOf('duty-faction-block') === -1) {
      html += emptyState('Нет выполненных задач за выбранный период.');
    }

    container.innerHTML = html;

    document.getElementById('statsCurrentBtn')?.addEventListener('click', () => {
      _statisticsMode = 'current';
      loadStatistics();
    });
    document.getElementById('statsArchiveBtn')?.addEventListener('click', () => {
      _statisticsMode = 'archive';
      loadStatistics();
    });

  } catch (err) {
    console.error('Статистика', err);
    container.innerHTML = errorState('Не удалось загрузить статистику. ' + humanError(err), 'retry-duties');
  }
}

window.loadDuties = loadDuties;
window.openDutyTemplateModal = openDutyTemplateModal;
window.saveDutyTemplate = saveDutyTemplate;
