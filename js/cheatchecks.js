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
                <span class="category-icon">🤖</span>
                <span>Боты</span>
              </button>
              <button class="cheat-category-btn category-soft" data-category="soft">
                <span class="category-icon">💻</span>
                <span>Софт</span>
              </button>
              <button class="cheat-category-btn category-hunt" data-category="hunt">
                <span class="category-icon">🎯</span>
                <span>Охота</span>
              </button>
              <button class="cheat-category-btn category-other" data-category="other">
                <span class="category-icon">📋</span>
                <span>Другое</span>
              </button>
            </div>
          </div>

          <div class="field">
            <label>РЕЗУЛЬТАТ <span class="required">*</span></label>
            <div class="cheat-results">
              <button class="cheat-result-btn result-passed" data-result="passed">
                <span class="result-icon">✓</span>
                <span>Прошёл</span>
              </button>
              <button class="cheat-result-btn result-blocked" data-result="blocked">
                <span class="result-icon">✕</span>
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
    <div class="table-card">
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
