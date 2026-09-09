let _dashboardUnsubs = [];

function stopDashboardRealtime(){
  _dashboardUnsubs.forEach(unsub => { try { unsub(); } catch (_) {} });
  _dashboardUnsubs = [];
}

async function renderDashboard(){
  stopDashboardRealtime();
  const root = document.getElementById('dashboardRoot');
  if (!isSignedIn()){ root.innerHTML = lockedState('Войдите, чтобы открыть главную.'); return; }
  const u = state.user;
  const s = forumSummary();
  const hour = getMoscowNow().getHours();
  const greet = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const displayName = cleanDiscordGuildNickname(u.displayName || u.discordGuildNickname || u.discordDisplayName || u.email);
  const activeLeaders = s ? Math.max(0, s.total - s.vacant) : 0;
  const urgentLeaders = state.forum ? leaderEntries().filter(x => x.info.days !== null && x.info.status !== 'vacant' && x.info.days <= 7).length : 0;
  const nearest = state.forum ? leaderEntries().filter(x => x.info.days !== null && x.info.status !== 'vacant').sort((a,b) => a.info.days - b.info.days)[0] : null;
  const curatedCount = isSiteAdmin() ? state.factions.filter(f => f.active !== false).length : (isLeader() ? (myFaction() ? 1 : 0) : curatedFactions().length);

  root.innerHTML = `
    <section class="hero dashboard-hero">
      <div class="hero-left">
        <div class="hero-kicker">GTA5RP HUB · рабочая сводка</div>
        <h2>${greet}, ${escapeHtml(displayName || u.email)}</h2>
        <div class="dashboard-role-line">
          ${roleBadge(u)}
          ${(isStaff() || isSiteAdmin()) ? levelBadge(u.serverLevel) : ''}
          ${isLeader() && myFaction() ? factionChipHtml(myFaction()) : ''}
        </div>
        <div class="dashboard-context">
          ${isSiteAdmin()
            ? 'Полный обзор проекта: лидеры, обязанности, заявки и журнал изменений.'
            : (isLeader() && myFaction()
              ? `Ваша фракция: ${factionChipHtml(myFaction())}`
              : (curatedFactions().length
                ? `Курируемые фракции: ${curatedFactions().map(f => factionChipHtml(f)).join(' ')}`
                : 'Курируемые фракции пока не назначены.'))}
        </div>
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

    <div class="dashboard-kpis">
      <div class="dashboard-kpi"><span>Активных лидеров</span><b>${s ? activeLeaders : '—'}</b><small>${s ? `из ${s.total} фракций` : 'форум загружается'}</small></div>
      <div class="dashboard-kpi"><span>Срок ≤ 7 дней</span><b class="${urgentLeaders ? 'kpi-alert' : ''}">${s ? urgentLeaders : '—'}</b><small>${nearest ? `ближайший: ${escapeHtml(daysText(nearest.info.days))}` : 'критичных сроков нет'}</small></div>
      <div class="dashboard-kpi"><span>${isSiteAdmin() ? 'Активных фракций' : (isLeader() ? 'Моя фракция' : 'Курируется')}</span><b>${curatedCount}</b><small>${isSiteAdmin() ? 'в системе' : (isLeader() && myFaction() ? escapeHtml(factionName(myFaction())) : 'назначено вам')}</small></div>
      <div class="dashboard-kpi" id="dashRealtimeKpi"><span>${isSiteAdmin() ? 'Ожидают доступа' : 'Обновление форума'}</span><b id="dashRealtimeKpiValue">${isSiteAdmin() ? '…' : (state.forumTime ? '✓' : '—')}</b><small id="dashRealtimeKpiText">${isSiteAdmin() ? 'заявки Discord' : (state.forumTime ? fmtDateTime(state.forumTime) : 'ещё не обновлялся')}</small></div>
    </div>

    <div class="dash-grid dashboard-workspace" id="dashGrid">
      <div class="card dash-block dash-priority"><div class="dash-card-head"><h3>Ближайшие сроки</h3><span class="dash-card-icon">⌛</span></div><div id="dashDeadlines">${upcomingDeadlinesHtml()}</div></div>
      <div class="card dash-block"><div class="dash-card-head"><h3>Новости</h3><span class="dash-card-icon">◫</span></div><div id="dashNews">${skeletonRows(2)}</div></div>
      ${canManageDuties() ? `<div class="card dash-block"><div class="dash-card-head"><h3>Мои обязанности</h3><span class="dash-card-icon">✓</span></div><div id="dashDuties">${skeletonRows(2)}</div></div>` : ''}
      ${isSiteAdmin() ? `<div class="card dash-block"><div class="dash-card-head"><h3>Заявки на рассмотрении</h3><span class="dash-card-icon">?</span></div><div id="dashTickets">${skeletonRows(2)}</div></div>
      <div class="card dash-block"><div class="dash-card-head"><h3>Ожидают доступ</h3><span class="dash-card-icon">↪</span></div><div id="dashAccess">${skeletonRows(2)}</div></div>` : ''}
      ${canAccessTab('audit') ? `<div class="card dash-block dash-wide"><div class="dash-card-head"><h3>Последние действия</h3><span class="dash-card-icon">≡</span></div><div id="dashAudit">${skeletonRows(3)}</div></div>` : ''}
    </div>`;
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

function loadDashBlocks(){
  stopDashboardRealtime();
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const watch = unsub => { if (typeof unsub === 'function') _dashboardUnsubs.push(unsub); };

  watch(db.collection('news').where('deleted', '==', false).limit(30).onSnapshot(snap => {
    const news = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)).slice(0, 3);
    set('dashNews', news.length
      ? `<div class="mini-list">${news.map(n => `<div class="mini-row" data-tab="news"><span class="mini-name">${escapeHtml(n.title)}</span><span class="mono hint">${fmtDate(n.createdAt)}</span></div>`).join('')}</div>`
      : '<div class="hint">Новостей пока нет.</div>');
  }, err => {
    console.error('Новости', err);
    set('dashNews', '<div class="hint">Не удалось загрузить новости.</div>');
  }));

  if (canManageDuties()){
    const factionIds = getFactionsForDuties();
    const weekStart = getWeekStart(getMoscowNow());
    const dutyDocs = {};
    const renderMine = () => {
      const mine = [];
      Object.entries(dutyDocs).forEach(([fid, data]) => {
        (data?.tasks || []).forEach(task => {
          const assignees = Array.isArray(task.assignees) ? task.assignees : [];
          const completedBy = Array.isArray(task.completedBy) ? task.completedBy : [];
          if (!assignees.includes(state.user?.uid) || completedBy.includes(state.user?.uid)) return;
          mine.push({
            fid,
            name: task.name || 'Без названия',
            status: getTaskStatus(task, weekStart)
          });
        });
      });
      mine.sort((a, b) => String(a.fid).localeCompare(String(b.fid), 'ru') || String(a.name).localeCompare(String(b.name), 'ru'));
      set('dashDuties', mine.length
        ? `<div class="mini-list">${mine.slice(0, 6).map(d => `<div class="mini-row" data-tab="duties"><span class="mini-name">${escapeHtml(d.name)} <span class="hint">${factionChipHtml(d.fid)}</span></span><span class="badge ${statusBadgeClass(d.status)}">${escapeHtml(d.status)}</span></div>`).join('')}</div>${mine.length > 6 ? `<div class="hint">и ещё ${mine.length - 6}</div>` : ''}`
        : '<div class="hint">Активных обязанностей нет.</div>');
    };

    if (!factionIds.length) {
      set('dashDuties', '<div class="hint">Курируемые фракции не назначены.</div>');
    } else {
      factionIds.forEach(fid => {
        const docId = `${fid}_${weekStart.toISOString().slice(0,10)}`;
        watch(db.collection('dutyWeeks').doc(docId).onSnapshot(snap => {
          dutyDocs[fid] = snap.exists ? snap.data() : null;
          renderMine();
        }, err => {
          console.error('Обязанности', err);
          set('dashDuties', '<div class="hint">Не удалось загрузить обязанности.</div>');
        }));
      });
    }
  }

  if (isSiteAdmin()){
    watch(db.collection('pendingUsers').onSnapshot(snap => {
      const pending = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
        .sort((a,b) => (toDate(b.attemptedAt)?.getTime() || 0) - (toDate(a.attemptedAt)?.getTime() || 0));
      const kpiValue = document.getElementById('dashRealtimeKpiValue');
      const kpiText = document.getElementById('dashRealtimeKpiText');
      if (kpiValue) kpiValue.textContent = String(pending.length);
      if (kpiText) kpiText.textContent = pending.length ? 'требуют решения' : 'очередь пуста';
      set('dashAccess', pending.length
        ? `<div class="mini-list">${pending.slice(0, 5).map(p => `<div class="mini-row" data-tab="pending"><span class="mini-name">${escapeHtml(cleanDiscordGuildNickname(p.displayName || p.discordGuildNickname || p.discordUsername || p.email || 'Без имени'))}</span><span class="mono hint">${fmtDateTime(p.attemptedAt)}</span></div>`).join('')}</div>${pending.length > 5 ? `<div class="hint">и ещё ${pending.length - 5}</div>` : ''}`
        : '<div class="hint">Нет ожидающих подтверждения.</div>');
    }, err => {
      console.error('Доступ', err);
      set('dashAccess', '<div class="hint">Не удалось загрузить заявки доступа.</div>');
    }));

    watch(db.collection('supportTickets')
      .where('deleted', '==', false)
      .where('status', '==', 'На рассмотрении')
      .limit(20)
      .onSnapshot(snap => {
        const t = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a,b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
        set('dashTickets', t.length
          ? `<div class="mini-list">${t.slice(0, 5).map(x => `<div class="mini-row" data-tab="support"><span class="mini-name"><span class="chip chip-sm">${escapeHtml(TICKET_TYPES[x.type] || x.type)}</span> ${escapeHtml(x.title)}</span><span class="mono hint">${fmtDate(x.createdAt)}</span></div>`).join('')}</div>${t.length > 5 ? `<div class="hint">и ещё ${t.length - 5}</div>` : ''}`
          : '<div class="hint">Все заявки обработаны.</div>');
      }, err => {
        console.error('Поддержка', err);
        set('dashTickets', '<div class="hint">Не удалось загрузить заявки.</div>');
      }));
  }

  if (canAccessTab('audit')){
    watch(db.collection('auditLog').orderBy('timestamp', 'desc').limit(6).onSnapshot(snap => {
      const a = snap.docs.map(d => d.data());
      set('dashAudit', a.length
        ? `<div class="mini-list">${a.map(x => `<div class="mini-row" data-tab="audit"><span class="mini-name"><b>${escapeHtml(x.nickname || x.email)}</b> ${escapeHtml(x.action)}</span><span class="mono hint">${fmtDateTime(x.timestamp)}</span></div>`).join('')}</div>`
        : '<div class="hint">Действий пока нет.</div>');
    }, err => {
      console.error('Журнал', err);
      set('dashAudit', '<div class="hint">Не удалось загрузить журнал.</div>');
    }));
  }
}

window.stopDashboardRealtime = stopDashboardRealtime;
