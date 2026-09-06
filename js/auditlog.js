let _audit = [];
let _auditCursor = null;
let _auditHasMore = false;
let _auditSearch = '';

async function loadAudit(more){
  const root = document.getElementById('auditRoot');
  if (!canAccessTab('audit')){ root.innerHTML = lockedState('Раздел доступен администратору сайта.'); return; }
  if (!more){
    _audit = [];
    _auditCursor = null;
    root.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-note" id="auditNote">Загрузка…</div>
        <label class="search-box"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="auditSearch" placeholder="Кто, что, объект" value="${escapeHtml(_auditSearch)}" autocomplete="off"></label>
      </div>
      <div id="auditList">${skeletonRows(6)}</div>`;
    document.getElementById('auditSearch').addEventListener('input', debounce(e => { _auditSearch = e.target.value; renderAudit(); }, 150));
  }
  try {
    let q = db.collection('auditLog').orderBy('timestamp', 'desc').limit(PAGE_SIZE);
    if (_auditCursor) q = q.startAfter(_auditCursor);
    const snap = await q.get();
    _auditCursor = snap.docs[snap.docs.length - 1] || _auditCursor;
    _auditHasMore = snap.docs.length === PAGE_SIZE;
    _audit = _audit.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    renderAudit();
  } catch (err){
    console.error('Журнал', err);
    document.getElementById('auditList').innerHTML = errorState('Не удалось загрузить журнал. ' + humanError(err), 'retry-audit');
  }
}

function auditValue(v){
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object'){
    return Object.keys(v).map(k => `${k}: ${Array.isArray(v[k]) ? v[k].join(', ') || '—' : String(v[k])}`).join('; ');
  }
  return String(v);
}

function renderAudit(){
  const el = document.getElementById('auditList');
  if (!el) return;
  const q = _auditSearch.trim().toLowerCase();
  const rows = q ? _audit.filter(a =>
    (a.nickname || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q) ||
    (a.action || '').toLowerCase().includes(q) || (a.objectType || '').toLowerCase().includes(q) ||
    (a.objectId || '').toLowerCase().includes(q) || factionName(a.faction).toLowerCase().includes(q)) : _audit;
  document.getElementById('auditNote').textContent = `Записей: ${_audit.length}${_auditHasMore ? '+' : ''}`;
  if (!rows.length){ el.innerHTML = emptyState(_audit.length ? 'Ничего не найдено.' : 'Журнал пока пуст.'); return; }
  el.innerHTML = `<div class="timeline">${rows.map(a => `
    <div class="tl-item">
      <div class="tl-time mono">${fmtDateTime(a.timestamp)}</div>
      <div class="tl-body">
        <div class="tl-who"><b>${escapeHtml(a.nickname || a.email)}</b> <span class="hint">${escapeHtml(ROLES[a.systemRole] || a.systemRole)}${a.faction ? ' · ' + escapeHtml(factionName(a.faction)) : ''} · ${escapeHtml(levelLabel(a.serverLevel))}</span></div>
        <div class="tl-action">${escapeHtml(a.action)}${a.additionalInfo ? ` <span class="hint">— ${escapeHtml(a.additionalInfo)}</span>` : ''}</div>
        ${a.oldValue || a.newValue ? `<div class="tl-diff">${a.oldValue ? `<span class="diff-old">${escapeHtml(auditValue(a.oldValue))}</span>` : ''}${a.oldValue && a.newValue ? ' → ' : ''}${a.newValue ? `<span class="diff-new">${escapeHtml(auditValue(a.newValue))}</span>` : ''}</div>` : ''}
        <div class="tl-obj mono">${escapeHtml(a.objectType || '')}${a.objectId ? ' · ' + escapeHtml(a.objectId) : ''}</div>
      </div>
    </div>`).join('')}</div>${_auditHasMore && !q ? '<button class="btn btn-block" data-action="audit-more">Загрузить ещё</button>' : ''}`;
}
