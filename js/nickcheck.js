let _nickcheckState = {
  discordInput: '',
  gameInput: '',
  discordUsers: [],
  gameNicknames: [],
  missingUsers: [],
  stats: null
};

function normalizeNickname(nick) {
  return String(nick || '').trim().toLowerCase().replace(/\s+/g, '');
}

function parseDiscordUsers(text) {
  const lines = text.split('\n');
  const users = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let discordId = null;
    let nickname = trimmed;

    const mentionMatch = trimmed.match(/^<@!?(\d+)>\s*(.+)?$/);
    if (mentionMatch) {
      discordId = mentionMatch[1];
      nickname = mentionMatch[2] || '';
    }

    if (!nickname) continue;

    const normalized = normalizeNickname(nickname);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    users.push({
      original: nickname,
      normalized: normalized,
      discordId: discordId
    });
  }

  return users;
}

function parseGameNicknames(text) {
  const lines = text.split('\n');
  const nicknames = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const normalized = normalizeNickname(trimmed);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    nicknames.push({
      original: trimmed,
      normalized: normalized
    });
  }

  return nicknames;
}

function compareNicknames(discordUsers, gameNicknames) {
  const gameSet = new Set(gameNicknames.map(n => n.normalized));
  const missing = discordUsers.filter(u => !gameSet.has(u.normalized));
  const matched = discordUsers.filter(u => gameSet.has(u.normalized));

  return {
    discordCount: discordUsers.length,
    gameCount: gameNicknames.length,
    matchedCount: matched.length,
    missingCount: missing.length,
    missing: missing
  };
}

function getDiscordMentions(missingUsers) {
  return missingUsers
    .filter(u => u.discordId)
    .map(u => `<@${u.discordId}>`);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Скопировано');
  }).catch(() => {
    toast('Не удалось скопировать', 'error');
  });
}

function renderNickcheck() {
  const root = document.getElementById('nickcheckRoot');
  if (!canManageDuties()) {
    root.innerHTML = isSignedIn() 
      ? emptyState('Раздел доступен помощникам кураторов, кураторам и администратору сайта.')
      : lockedState('Войдите, чтобы открыть проверку ников.');
    return;
  }

  root.innerHTML = `
    <div class="nickcheck-layout">
      <div class="nickcheck-inputs">
        <div class="card form-card">
          <h3>Discord</h3>
          <div class="field">
            <textarea id="nickcheckDiscord" rows="10" placeholder="Nickname1&#10;Nickname2&#10;@123456789 Nickname3">${escapeHtml(_nickcheckState.discordInput)}</textarea>
            <div class="hint">Каждая строка — отдельный пользователь. Формат: &lt;@ID&gt; Nickname или просто Nickname</div>
          </div>
        </div>
        <div class="card form-card">
          <h3>Сайт / игра</h3>
          <div class="field">
            <textarea id="nickcheckGame" rows="10" placeholder="Nickname1&#10;Nickname3&#10;Nickname4">${escapeHtml(_nickcheckState.gameInput)}</textarea>
            <div class="hint">Каждая строка — отдельный никнейм</div>
          </div>
        </div>
      </div>
      <div class="nickcheck-actions">
        <button class="btn btn-primary btn-block" id="nickcheckCheckBtn"><span class="spinner"></span><span>Проверить ники</span></button>
        <button class="btn btn-ghost btn-block" id="nickcheckClearBtn">Очистить</button>
      </div>
      ${_nickcheckState.stats ? renderNickcheckResults() : ''}
    </div>
  `;

  document.getElementById('nickcheckDiscord').addEventListener('input', e => {
    _nickcheckState.discordInput = e.target.value;
  });
  document.getElementById('nickcheckGame').addEventListener('input', e => {
    _nickcheckState.gameInput = e.target.value;
  });
  document.getElementById('nickcheckCheckBtn').addEventListener('click', performNickcheck);
  document.getElementById('nickcheckClearBtn').addEventListener('click', clearNickcheck);
}

function renderNickcheckResults() {
  const stats = _nickcheckState.stats;
  const missing = _nickcheckState.missingUsers;

  return `
    <div class="nickcheck-results">
      <div class="card stats-card">
        <h3>Результаты</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${stats.discordCount}</div>
            <div class="stat-label">Ников в Discord</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.gameCount}</div>
            <div class="stat-label">Ников на сайте</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.matchedCount}</div>
            <div class="stat-label">Совпадений</div>
          </div>
          <div class="stat-item ${stats.missingCount > 0 ? 'stat-warn' : ''}">
            <div class="stat-value">${stats.missingCount}</div>
            <div class="stat-label">Отсутствуют</div>
          </div>
        </div>
      </div>
      ${missing.length > 0 ? `
        <div class="card missing-card">
          <h3>Отсутствуют на сайте</h3>
          <div class="missing-list">
            ${missing.map(u => `
              <div class="missing-item">
                <span class="missing-nick">${escapeHtml(u.original)}</span>
                ${u.discordId ? `<span class="missing-id mono">&lt;@${escapeHtml(u.discordId)}&gt;</span>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="missing-actions">
            <button class="btn" id="nickcheckCopyNicks">Скопировать ники</button>
            <button class="btn" id="nickcheckCopyMentions">Скопировать упоминания Discord</button>
          </div>
        </div>
      ` : `
        <div class="card success-card">
          <div class="success-message">Все Discord ники найдены на сайте.</div>
        </div>
      `}
    </div>
  `;
}

function performNickcheck() {
  const discordText = _nickcheckState.discordInput;
  const gameText = _nickcheckState.gameInput;

  if (!discordText.trim()) {
    toast('Введите список Discord ников', 'error');
    return;
  }

  if (!gameText.trim()) {
    toast('Введите список ников сайта', 'error');
    return;
  }

  const discordUsers = parseDiscordUsers(discordText);
  const gameNicknames = parseGameNicknames(gameText);

  if (discordUsers.length === 0) {
    toast('Список Discord не содержит валидных ников', 'error');
    return;
  }

  if (gameNicknames.length === 0) {
    toast('Список сайта не содержит валидных ников', 'error');
    return;
  }

  const result = compareNicknames(discordUsers, gameNicknames);

  _nickcheckState.discordUsers = discordUsers;
  _nickcheckState.gameNicknames = gameNicknames;
  _nickcheckState.missingUsers = result.missing;
  _nickcheckState.stats = {
    discordCount: result.discordCount,
    gameCount: result.gameCount,
    matchedCount: result.matchedCount,
    missingCount: result.missingCount
  };

  renderNickcheck();

  if (result.missing.length > 0) {
    document.getElementById('nickcheckCopyNicks').addEventListener('click', () => {
      const nicks = result.missing.map(u => u.original).join('\n');
      copyToClipboard(nicks);
    });

    document.getElementById('nickcheckCopyMentions').addEventListener('click', () => {
      const mentions = getDiscordMentions(result.missing).join('\n');
      if (mentions) {
        copyToClipboard(mentions);
      } else {
        toast('Нет пользователей с Discord ID', 'error');
      }
    });
  }

  addNickcheckAudit(result);
}

function clearNickcheck() {
  _nickcheckState = {
    discordInput: '',
    gameInput: '',
    discordUsers: [],
    gameNicknames: [],
    missingUsers: [],
    stats: null
  };
  renderNickcheck();
}

async function addNickcheckAudit(result) {
  try {
    const batch = db.batch();
    addAudit(batch, {
      action: 'Выполнил проверку ников',
      objectType: 'nickcheck',
      objectId: null,
      additionalInfo: `Discord: ${result.discordCount}, Сайт: ${result.gameCount}, Совпадений: ${result.matchedCount}, Отсутствуют: ${result.missingCount}`
    });
    await batch.commit();
  } catch (err) {
    console.error('Audit log for nickcheck', err);
  }
}
