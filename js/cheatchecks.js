let _cheatReportState = {
  nickName: '',
  social: '',
  category: null,
  result: null,
  comment: ''
};

let _cheatHistoryData = [];
let _cheatHistorySearch = '';

const CHEAT_CATEGORIES = {
  bots: 'Боты',
  soft: 'Софт',
  hunt: 'Охота',
  other: 'Другое'
};

const CHEAT_RESULTS = {
  passed: 'Прошёл',
  blocked: 'Заблокирован'
};

function renderCheatReport() {
  const root = document.getElementById('cheatReportRoot');
  if (!canManageDuties()) {
    root.innerHTML = isSignedIn()
      ? emptyState('Раздел доступен помощникам кураторов, кураторам и администратору сайта.')
      : lockedState('Войдите, чтобы открыть чит-проверки.');
    return;
  }

  root.innerHTML = `
    <div class="cheat-report-container">
      <div class="cheat-report-card">
        <div class="cheat-report-header">
          <h2>Чит-проверка</h2>
          <p class="cheat-report-subtitle">Отчёт автоматически привяжется к вашему профилю</p>
          <div class="cheat-report-profile">
            <div class="cheat-report-avatar avatar">${(state.user?.displayName || state.user?.email || '?').charAt(0).toUpperCase()}</div>
            <div class="cheat-report-profile-info">
              <div class="cheat-report-nick">${escapeHtml(state.user?.displayName || state.user?.email || 'Гость')}</div>
              <div class="cheat-report-checker">Проверяющий</div>
            </div>
          </div>
        </div>

        <div class="cheat-report-form">
          <div class="field">
            <label for="cheatNickName">NICK NAME <span class="required">*</span></label>
            <input type="text" id="cheatNickName" value="${escapeHtml(_cheatReportState.nickName)}" placeholder="Введите никнейм" maxlength="50">
          </div>

          <div class="field">
            <label for="cheatSocial">SOCIAL <span class="required">*</span></label>
            <input type="text" id="cheatSocial" value="${escapeHtml(_cheatReportState.social)}" placeholder="Discord, VK и т.д." maxlength="100">
          </div>

          <div class="field">
            <label>КАТЕГОРИЯ <span class="required">*</span></label>
            <div class="cheat-categories">
              <button class="cheat-category-btn category-bots" data-category="bots">
                <svg class="category-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                <span>Боты</span>
              </button>
              <button class="cheat-category-btn category-soft" data-category="soft">
                <svg class="category-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span>Софт</span>
              </button>
              <button class="cheat-category-btn category-hunt" data-category="hunt">
                <svg class="category-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                <span>Охота</span>
              </button>
              <button class="cheat-category-btn category-other" data-category="other">
                <svg class="category-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>Другое</span>
              </button>
            </div>
          </div>

          <div class="field">
            <label>РЕЗУЛЬТАТ <span class="required">*</span></label>
            <div class="cheat-results">
              <button class="cheat-result-btn result-passed" data-result="passed">
                <svg class="result-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Прошёл</span>
              </button>
              <button class="cheat-result-btn result-blocked" data-result="blocked">
                <svg class="result-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>Заблокирован</span>
              </button>
            </div>
          </div>

          <div class="field">
            <label for="cheatComment">ИТОГ / КОММЕНТАРИЙ</label>
            <textarea id="cheatComment" rows="5" placeholder="Дополнительная информация о проверке..." maxlength="2000">${escapeHtml(_cheatReportState.comment)}</textarea>
          </div>

          <button class="btn btn-primary btn-block cheat-submit-btn" id="cheatSubmitBtn">
            <span class="spinner"></span>
            <span>Отправить отчёт</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('cheatNickName').addEventListener('input', e => {
    _cheatReportState.nickName = e.target.value;
  });

  document.getElementById('cheatSocial').addEventListener('input', e => {
    _cheatReportState.social = e.target.value;
  });

  document.getElementById('cheatComment').addEventListener('input', e => {
    _cheatReportState.comment = e.target.value;
  });

  document.querySelectorAll('.cheat-category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      _cheatReportState.category = category;
      document.querySelectorAll('.cheat-category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('.cheat-result-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const result = btn.dataset.result;
      _cheatReportState.result = result;
      document.querySelectorAll('.cheat-result-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  if (_cheatReportState.category) {
    document.querySelector(`.cheat-category-btn[data-category="${_cheatReportState.category}"]`)?.classList.add('active');
  }

  if (_cheatReportState.result) {
    document.querySelector(`.cheat-result-btn[data-result="${_cheatReportState.result}"]`)?.classList.add('active');
  }

  document.getElementById('cheatSubmitBtn').addEventListener('click', submitCheatReport);
}

async function submitCheatReport() {
  const nickName = _cheatReportState.nickName.trim();
  const social = _cheatReportState.social.trim();
  const category = _cheatReportState.category;
  const result = _cheatReportState.result;
  const comment = _cheatReportState.comment.trim();

  if (!nickName) {
    toast('Введите никнейм', 'error');
    return;
  }

  if (!social) {
    toast('Введите социальную сеть', 'error');
    return;
  }

  if (!category) {
    toast('Выберите категорию', 'error');
    return;
  }

  if (!result) {
    toast('Выберите результат', 'error');
    return;
  }

  const btn = document.getElementById('cheatSubmitBtn');
  setLoading(btn, true);

  try {
    await db.collection('cheatChecks').add({
      nickName,
      social,
      category,
      categoryLabel: CHEAT_CATEGORIES[category],
      result,
      resultLabel: CHEAT_RESULTS[result],
      comment,
      checkerId: state.user.uid,
      checkerName: state.user.displayName || state.user.email,
      checkerEmail: state.user.email,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    toast('Отчёт отправлен');

    _cheatReportState = {
      nickName: '',
      social: '',
      category: null,
      result: null,
      comment: ''
    };

    renderCheatReport();

    addCheatCheckAudit(category, result, nickName);
  } catch (err) {
    console.error('Ошибка при отправке отчёта:', err);
    failToast(err, 'Не удалось отправить отчёт');
  } finally {
    setLoading(btn, false);
  }
}

async function addCheatCheckAudit(category, result, nickName) {
  try {
    const batch = db.batch();
    addAudit(batch, {
      action: 'Создал отчёт чит-проверки',
      objectType: 'cheatCheck',
      objectId: null,
      additionalInfo: `Категория: ${CHEAT_CATEGORIES[category]}, Результат: ${CHEAT_RESULTS[result]}, Ник: ${nickName}`
    });
    await batch.commit();
  } catch (err) {
    console.error('Audit log for cheat check', err);
  }
}

function renderCheatHistory() {
  const root = document.getElementById('cheatHistoryRoot');
  if (!canManageDuties()) {
    root.innerHTML = isSignedIn()
      ? emptyState('Раздел доступен помощникам кураторов, кураторам и администратору сайта.')
      : lockedState('Войдите, чтобы открыть историю чит-проверок.');
    return;
  }

  root.innerHTML = `
    <div class="cheat-history-container">
      <div class="cheat-history-header">
        <h2>История чит-проверок</h2>
        <div class="cheat-history-search">
          <label class="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="search" id="cheatHistorySearchInput" placeholder="Поиск по нику, соц. сети, комментарию..." value="${escapeHtml(_cheatHistorySearch)}">
          </label>
        </div>
      </div>

      <div class="cheat-history-content" id="cheatHistoryContent">
        <div class="loading-state">Загрузка...</div>
      </div>
    </div>
  `;

  document.getElementById('cheatHistorySearchInput').addEventListener('input', e => {
    _cheatHistorySearch = e.target.value;
    renderCheatHistoryContent();
  });

  loadCheatHistory();
}

async function loadCheatHistory() {
  const content = document.getElementById('cheatHistoryContent');
  if (!content) return;

  try {
    let q = db.collection('cheatChecks').orderBy('createdAt', 'desc').limit(100);

    const snap = await q.get();
    _cheatHistoryData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderCheatHistoryContent();
  } catch (err) {
    console.error('Ошибка при загрузке истории:', err);
    content.innerHTML = errorState('Не удалось загрузить историю. ' + humanError(err), 'retry-cheat-history');
  }
}

function renderCheatHistoryContent() {
  const content = document.getElementById('cheatHistoryContent');
  if (!content) return;

  const search = _cheatHistorySearch.toLowerCase().trim();

  let filtered = _cheatHistoryData;

  if (search) {
    filtered = filtered.filter(item => {
      return (
        (item.nickName || '').toLowerCase().includes(search) ||
        (item.social || '').toLowerCase().includes(search) ||
        (item.comment || '').toLowerCase().includes(search) ||
        (item.checkerName || '').toLowerCase().includes(search) ||
        (item.categoryLabel || '').toLowerCase().includes(search) ||
        (item.resultLabel || '').toLowerCase().includes(search)
      );
    });
  }

  if (!filtered.length) {
    content.innerHTML = _cheatHistoryData.length
      ? emptyState('По вашему запросу ничего не найдено.')
      : emptyState('История пока пуста.');
    return;
  }

  content.innerHTML = `
    <div class="card table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>NICK NAME</th>
            <th>SOCIAL</th>
            <th>КАТЕГОРИЯ</th>
            <th>РЕЗУЛЬТАТ</th>
            <th>ПРОВЕРЯЮЩИЙ</th>
            <th>КОММЕНТАРИЙ</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(item => `
            <tr>
              <td><span class="table-nick">${escapeHtml(item.nickName || '—')}</span></td>
              <td><span class="table-social">${escapeHtml(item.social || '—')}</span></td>
              <td>${renderCategoryBadge(item.category)}</td>
              <td>${renderResultBadge(item.result)}</td>
              <td><span class="table-checker">${escapeHtml(item.checkerName || '—')}</span></td>
              <td><span class="table-comment">${escapeHtml(item.comment || '—')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCategoryBadge(category) {
  const categoryLabels = {
    bots: 'Боты',
    soft: 'Софт',
    hunt: 'Охота',
    other: 'Другое'
  };

  const categoryColors = {
    bots: '#ff6b6b',
    soft: '#4ecdc4',
    hunt: '#ffe66d',
    other: '#95e1d3'
  };

  const color = categoryColors[category] || '#95e1d3';
  const label = categoryLabels[category] || category;

  return `<span class="badge" style="background: ${color}20; color: ${color}; border-color: ${color}40;">${escapeHtml(label)}</span>`;
}

function renderResultBadge(result) {
  if (result === 'passed') {
    return `<span class="badge badge-green">Прошёл</span>`;
  } else if (result === 'blocked') {
    return `<span class="badge badge-red">Заблокирован</span>`;
  }
  return `<span class="badge badge-grey">${escapeHtml(result) || '—'}</span>`;
}
