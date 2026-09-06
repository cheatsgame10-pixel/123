async function renderDashboard(){
  const root = document.getElementById('dashboardRoot');
  if (!isSignedIn()){ root.innerHTML = lockedState('Войдите, чтобы открыть главную.'); return; }
  const u = state.user;
  const s = forumSummary();
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  root.innerHTML = `
    <section class="hero">
      <div class="hero-left">
        <div class="hero-kicker">GTA5RP HUB · с ${PLATFORM_YEAR} года</div>
        <h2>${greet}, ${escapeHtml(u.displayName || u.email)}</h2>
        <p>Единое рабочее пространство курирования: список лидеров с форума и сроками, отчёты, обязанности, архив лидерства, новости и поддержка. Каждое критическое действие проверяется правилами Firebase и попадает в журнал, а удалённое можно восстановить.</p>
        <div class="hero-tags">${roleBadge(u)}${levelBadge(u.serverLevel)}${isLeader() ? `<span class="faction-badge">${escapeHtml(factionName(myFaction()))}</span>` : ''}${isStaff() ? (curatedFactions().length ? curatedFactions().map(f => `<span class="faction-badge">${escapeHtml(factionName(f))}</span>`).join('') : '<span class="hint">Курируемые фракции не назначены</span>') : ''}</div>
      </div>
      <div class="hero-right">
        ${s ? `
        <div class="ring-wrap" data-tab="leaders" role="button" tabindex="0" title="Открыть список лидеров">
          ${ringSvg(s)}
          <div class="ring-legend">
            <div><i style="background:var(--green)"></i>Недавно назначены <b>${s.green}</b></div>
            <div><i style="background:var(--amber)"></i>Половина срока <b>${s.yellow}</b></div>
            <div><i style="background:var(--red)"></i>Конец срока и просрочка <b>${s.red}</b></div>
            <div><i style="background:var(--grey)"></i>Нет лидера <b>${s.vacant}</b></div>
          </div>
        </div>` : '<div class="hint">Данные форума ещё загружаются.</div>'}
      </div>
    </section>
    <div class="dash-grid" id="dashGrid">
      <div class="card dash-block"><h3>Ближайшие сроки</h3><div id="dashDeadlines">${upcomingDeadlinesHtml()}</div></div>
      <div class="card dash-block"><h3>Новости</h3><div id="dashNews">${skeletonRows(2)}</div></div>
      ${canManageDuties() ? `<div class="card dash-block"><h3>Мои обязанности</h3><div id="dashDuties">${skeletonRows(2)}</div></div>` : ''}
      ${isSiteAdmin() ? `<div class="card dash-block"><h3>Заявки на рассмотрении</h3><div id="dashTickets">${skeletonRows(2)}</div></div>` : ''}
      ${canAccessTab('audit') ? `<div class="card dash-block dash-wide"><h3>Последние действия</h3><div id="dashAudit">${skeletonRows(3)}</div></div>` : ''}
    </div>
    <div class="group-title">Разделы</div>
    <div class="actions-grid">${quickActions().map(a => `
      <button class="action-card" data-tab="${a.tab}">
        <div class="ac-title">${escapeHtml(a.title)}</div>
        <div class="ac-text">${escapeHtml(a.text)}</div>
      </button>`).join('')}</div>`;
  loadDashBlocks();
}

function forumSummary(){
  if (!state.forum) return null;
  const s = { total: 0, green: 0, yellow: 0, red: 0, vacant: 0 };
  leaderEntries().forEach(x => {
    s.total++;
    const st = x.info.status;
    if (st === 'vacant') s.vacant++;
    else if (st === 'green') s.green++;
    else if (st === 'yellow') s.yellow++;
    else if (st === 'red' || st === 'expired') s.red++;
  });
  return s;
}

function ringSvg(s){
  const parts = [['green', s.green], ['amber', s.yellow], ['red', s.red], ['grey', s.vacant]];
  const total = Math.max(1, s.total);
  const r = 54, c = 2 * Math.PI * r;
  let offset = 0;
  const segs = parts.map(([tone, n]) => {
    const len = c * n / total;
    const seg = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--${tone})" stroke-width="12" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
    offset += len;
    return seg;
  }).join('');
  return `<svg class="ring" viewBox="0 0 140 140" width="140" height="140"><circle cx="70" cy="70" r="${r}" fill="none" stroke="rgba(148,140,255,.12)" stroke-width="12"/>${segs}<text x="70" y="66" text-anchor="middle" class="ring-num">${s.total}</text><text x="70" y="84" text-anchor="middle" class="ring-label">фракций</text></svg>`;
}

function upcomingDeadlinesHtml(){
  if (!state.forum) return '<div class="hint">Данные форума ещё загружаются.</div>';
  const list = leaderEntries().filter(x => x.info.days !== null && x.info.status !== 'vacant')
    .sort((a, b) => a.info.days - b.info.days).slice(0, 6);
  if (!list.length) return '<div class="hint">Нет активных лидеров.</div>';
  return `<div class="mini-list">${list.map(x => `
    <div class="mini-row" data-tab="leaders">
      <span class="dot-status" data-status="${x.info.status}"></span>
      <span class="mini-name">${escapeHtml(x.faction ? x.faction.name : x.key)} <span class="hint">${escapeHtml(x.entry.nickname)}</span></span>
      <span class="mono days-${x.info.status}">${escapeHtml(daysText(x.info.days))}</span>
    </div>`).join('')}</div>`;
}

function quickActions(){
  const a = [];
  a.push({ tab: 'leaders', title: 'Список лидеров', text: 'Актуальные лидеры с форума, сроки, баллы и предупреждения.' });
  if (canViewReports()) a.push({ tab: 'reports', title: isLeader() ? 'Мои отчёты' : 'Отчёты', text: isLeader() ? `Отчёты по фракции ${factionName(myFaction())}.` : 'Отчёты по доступным вам фракциям.' });
  if (canManageDuties()) a.push({ tab: 'duties', title: 'Обязанности', text: 'Взять проверку, обновить статус, посмотреть историю.' });
  a.push({ tab: 'archive', title: 'Архив лидеров', text: 'История сроков, результаты и причины ухода.' });
  a.push({ tab: 'news', title: 'Новости', text: 'Объявления администрации сайта.' });
  a.push({ tab: 'support', title: 'Поддержка', text: 'Сообщить о баге или предложить улучшение.' });
  if (isSiteAdmin() || isStaff()) a.push({ tab: 'users', title: 'Пользователи', text: isManager() ? 'Роли, уровни, курируемые фракции и права.' : 'Аккаунты лидеров курируемых фракций.' });
  if (isSiteAdmin()) a.push({ tab: 'factions', title: 'Фракции', text: 'Стабильные ID, логотипы и связь с форумом.' });
  if (canAccessTab('audit')) a.push({ tab: 'audit', title: 'Журнал действий', text: 'Кто, что и когда изменил.' });
  if (isSiteAdmin()) a.push({ tab: 'recovery', title: 'Восстановление', text: 'Удалённые записи и версии данных.' });
  return a;
}

async function loadDashBlocks(){
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  try {
    const snap = await db.collection('news').where('deleted', '==', false).limit(30).get();
    const news = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)).slice(0, 3);
    set('dashNews', news.length ? `<div class="mini-list">${news.map(n => `<div class="mini-row" data-tab="news"><span class="mini-name">${escapeHtml(n.title)}</span><span class="mono hint">${fmtDate(n.createdAt)}</span></div>`).join('')}</div>` : '<div class="hint">Новостей пока нет.</div>');
  } catch (err){ console.error('Новости', err); set('dashNews', '<div class="hint">Не удалось загрузить новости.</div>'); }

  if (canManageDuties()){
    try {
      let q = db.collection('dutyAssignments').where('checkerId', '==', state.user.uid).where('deleted', '==', false);
      if (!isSiteAdmin()) q = q.where('factionId', 'in', curatedFactions().slice(0, 30));
      const snap = curatedFactions().length || isSiteAdmin() ? await q.limit(50).get() : { docs: [] };
      const mine = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.status !== 'Выполнено' && d.status !== 'Отменено').sort((a, b) => String(a.dateTo).localeCompare(String(b.dateTo))).slice(0, 5);
      set('dashDuties', mine.length ? `<div class="mini-list">${mine.map(d => `<div class="mini-row" data-tab="duties"><span class="mini-name">${escapeHtml(d.name)} <span class="hint">${escapeHtml(d.factionName)}</span></span><span class="badge ${dutyTone(effectiveDutyStatus(d))}">${escapeHtml(effectiveDutyStatus(d))}</span></div>`).join('')}</div>` : '<div class="hint">Активных обязанностей нет.</div>');
    } catch (err){ console.error('Обязанности', err); set('dashDuties', '<div class="hint">Не удалось загрузить обязанности.</div>'); }
  }

  if (isSiteAdmin()){
    try {
      const snap = await db.collection('supportTickets').where('deleted', '==', false).where('status', '==', 'На рассмотрении').limit(20).get();
      const t = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      set('dashTickets', t.length ? `<div class="mini-list">${t.slice(0, 5).map(x => `<div class="mini-row" data-tab="support"><span class="mini-name"><span class="chip chip-sm">${escapeHtml(TICKET_TYPES[x.type] || x.type)}</span> ${escapeHtml(x.title)}</span><span class="mono hint">${fmtDate(x.createdAt)}</span></div>`).join('')}</div>${t.length > 5 ? `<div class="hint">и ещё ${t.length - 5}</div>` : ''}` : '<div class="hint">Все заявки обработаны.</div>');
    } catch (err){ console.error('Поддержка', err); set('dashTickets', '<div class="hint">Не удалось загрузить заявки.</div>'); }
  }

  if (canAccessTab('audit')){
    try {
      const snap = await db.collection('auditLog').orderBy('timestamp', 'desc').limit(6).get();
      const a = snap.docs.map(d => d.data());
      set('dashAudit', a.length ? `<div class="mini-list">${a.map(x => `<div class="mini-row" data-tab="audit"><span class="mini-name"><b>${escapeHtml(x.nickname || x.email)}</b> ${escapeHtml(x.action)}</span><span class="mono hint">${fmtDateTime(x.timestamp)}</span></div>`).join('')}</div>` : '<div class="hint">Действий пока нет.</div>');
    } catch (err){ console.error('Журнал', err); set('dashAudit', '<div class="hint">Не удалось загрузить журнал.</div>'); }
  }
}
