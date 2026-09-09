let _audit = [];
let _auditSearch = '';
let _auditUnsub = null;

async function loadAudit(){
  const root = document.getElementById('auditRoot');
  if (!canAccessTab('audit')){
    if (_auditUnsub) { _auditUnsub(); _auditUnsub = null; }
    root.innerHTML = lockedState('У вас нет доступа к журналу действий.');
    return;
  }

  if (_auditUnsub) { _auditUnsub(); _auditUnsub = null; }
  root.innerHTML = `
    <div class="toolbar audit-toolbar">
      <div class="toolbar-note" id="auditNote">Загрузка…</div>
      <label class="search-box"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="auditSearch" placeholder="Кто, что, объект" value="${escapeHtml(_auditSearch)}" autocomplete="off"></label>
    </div>
    <div id="auditList">${skeletonRows(6)}</div>`;
  document.getElementById('auditSearch').addEventListener('input', debounce(e => {
    _auditSearch = e.target.value;
    renderAudit();
  }, 120));

  _auditUnsub = db.collection('auditLog').orderBy('timestamp', 'desc').limit(250).onSnapshot(snap => {
    _audit = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAudit();
  }, err => {
    console.error('Журнал', err);
    const list = document.getElementById('auditList');
    if (list) list.innerHTML = errorState('Не удалось загрузить журнал. ' + humanError(err), 'retry-audit');
  });
}

function auditValue(v){
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object'){
    return Object.keys(v).map(k => `${k}: ${Array.isArray(v[k]) ? v[k].join(', ') || '—' : String(v[k])}`).join('; ');
  }
  return String(v);
}

function auditDiffHtml(a){
  if (!a.oldValue && !a.newValue) return '<span class="hint">—</span>';
  const oldText = a.oldValue ? auditValue(a.oldValue) : '';
  const newText = a.newValue ? auditValue(a.newValue) : '';
  return `<div class="audit-diff-cell">
    ${oldText ? `<span class="diff-old">${escapeHtml(oldText)}</span>` : ''}
    ${oldText && newText ? '<span class="audit-arrow">→</span>' : ''}
    ${newText ? `<span class="diff-new">${escapeHtml(newText)}</span>` : ''}
  </div>`;
}

function renderAudit(){
  const el = document.getElementById('auditList');
  if (!el) return;
  const q = _auditSearch.trim().toLowerCase();
  const rows = q ? _audit.filter(a =>
    (a.nickname || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q) ||
    (a.action || '').toLowerCase().includes(q) || (a.objectType || '').toLowerCase().includes(q) ||
    (a.objectId || '').toLowerCase().includes(q) || factionName(a.faction).toLowerCase().includes(q)) : _audit;
  const note = document.getElementById('auditNote');
  if (note) note.textContent = `Записей: ${_audit.length}`;
  if (!rows.length){
    el.innerHTML = emptyState(_audit.length ? 'Ничего не найдено.' : 'Журнал пока пуст.');
    return;
  }

  el.innerHTML = `<div class="card table-card table-scroll-shell audit-table-card">
    <table class="data-table audit-table">
      <thead><tr><th>Дата</th><th>Пользователь</th><th>Действие</th><th>Изменения</th><th>Объект</th></tr></thead>
      <tbody>${rows.map(a => `
        <tr>
          <td class="mono audit-date">${fmtDateTime(a.timestamp)}</td>
          <td>
            <div class="audit-user"><b>${escapeHtml(a.nickname || a.email || '—')}</b><span class="hint">${escapeHtml(ROLES[a.systemRole] || a.systemRole || '—')}${a.serverLevel ? ' · ' + escapeHtml(levelLabel(a.serverLevel)) : ''}</span>${a.faction ? factionChipHtml(a.faction) : ''}</div>
          </td>
          <td><div class="audit-action">${escapeHtml(a.action || '—')}</div>${a.additionalInfo ? `<div class="hint audit-extra">${escapeHtml(a.additionalInfo)}</div>` : ''}</td>
          <td>${auditDiffHtml(a)}</td>
          <td class="mono audit-object">${escapeHtml(a.objectType || '—')}${a.objectId ? `<span>${escapeHtml(a.objectId)}</span>` : ''}</td>
        </tr>`).join('')}</tbody>
    </table>
  </div>`;
}
