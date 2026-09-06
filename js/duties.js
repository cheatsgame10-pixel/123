let _dutyTypes = [];
let _duties = [];
const dutyUI = { faction: '', status: '' };

function dutyFactionIds(){
  return isSiteAdmin() ? state.factions.filter(f => f.active !== false).map(f => f.id) : curatedFactions();
}

async function loadDuties(){
  const root = document.getElementById('dutiesRoot');
  if (!canManageDuties()){ root.innerHTML = isSignedIn() ? emptyState('Раздел обязанностей доступен помощникам кураторов, кураторам и администратору сайта.') : lockedState('Войдите, чтобы открыть обязанности.'); return; }
  const ids = dutyFactionIds();
  if (!ids.length){ root.innerHTML = emptyState('Вам пока не назначены курируемые фракции.'); return; }
  root.innerHTML = skeletonRows(5);
  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    _dutyTypes = [];
    _duties = [];
    for (const chunk of chunks){
      const [t, a] = await Promise.all([
        db.collection('dutyTypes').where('factionId', 'in', chunk).get(),
        db.collection('dutyAssignments').where('factionId', 'in', chunk).where('deleted', '==', false).limit(300).get()
      ]);
      t.forEach(d => _dutyTypes.push({ id: d.id, ...d.data() }));
      a.forEach(d => _duties.push({ id: d.id, ...d.data() }));
    }
    _dutyTypes.sort(sortByName);
    _duties.sort((a, b) => String(b.dateTo || '').localeCompare(String(a.dateTo || '')) || (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    renderDuties();
  } catch (err){
    console.error('Обязанности', err);
    root.innerHTML = errorState('Не удалось загрузить обязанности. ' + humanError(err), 'retry-duties');
  }
}

function effectiveDutyStatus(d){
  if ((d.status === 'Не начато' || d.status === 'В процессе') && d.dateTo && d.dateTo < todayISO()) return 'Просрочено';
  return d.status;
}

function dutyTone(status){
  if (status === 'Выполнено') return 'badge-green';
  if (status === 'В процессе') return 'badge-yellow';
  if (status === 'Просрочено') return 'badge-red';
  return 'badge-grey';
}

function renderDuties(){
  const root = document.getElementById('dutiesRoot');
  const ids = dutyFactionIds();
  let rows = _duties;
  if (dutyUI.faction) rows = rows.filter(d => d.factionId === dutyUI.faction);
  if (dutyUI.status) rows = rows.filter(d => effectiveDutyStatus(d) === dutyUI.status);
  const overdue = _duties.filter(d => effectiveDutyStatus(d) === 'Просрочено').length;
  const missingDefaults = isSiteAdmin() ? Object.keys(DUTY_DEFAULTS).filter(fid => state.factionsById[fid] && !_dutyTypes.some(t => t.factionId === fid)) : [];
  root.innerHTML = `
    <div class="toolbar">
      <div class="stats-row">
        <span class="stat-chip static"><b>${_duties.length}</b>назначений</span>
        <span class="stat-chip static" data-tone="red"><b>${overdue}</b>просрочено</span>
        <span class="stat-chip static"><b>${_dutyTypes.filter(t => t.active !== false).length}</b>типов</span>
      </div>
      <div class="toolbar-right">
        <select class="select-inline" id="dutyFactionFilter"><option value="">Все фракции</option>${factionOptionsHtml(ids, dutyUI.faction)}</select>
        <select class="select-inline" id="dutyStatusFilter"><option value="">Все статусы</option>${DUTY_STATUSES.map(s => `<option${dutyUI.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
        <button class="btn btn-primary" data-action="duty-take">Взять обязанность</button>
        ${isSiteAdmin() ? `<button class="btn" data-action="duty-types">Типы обязанностей</button>` : ''}
      </div>
    </div>
    ${missingDefaults.length ? `<div class="notice">Для ${missingDefaults.map(f => factionName(f)).join(' и ')} ещё нет стандартных обязанностей. <button class="btn btn-sm" id="seedDutiesBtn" data-action="duty-seed"><span class="spinner"></span><span>Добавить стандартный список</span></button></div>` : ''}
    ${!rows.length ? emptyState(_duties.length ? 'Ничего не найдено по фильтрам.' : 'Назначений пока нет. Нажмите «Взять обязанность».') : `<div class="duty-list">${rows.map(d => {
      const st = effectiveDutyStatus(d);
      const own = d.checkerId === state.user.uid;
      return `
      <div class="duty-item">
        <div class="duty-main">
          <div class="duty-title">${escapeHtml(d.name)}</div>
          <div class="duty-meta">${escapeHtml(d.factionName || factionName(d.factionId))} · проверяющий: <b>${escapeHtml(d.checkerName)}</b> · <span class="mono">${fmtISO(d.dateFrom)} — ${fmtISO(d.dateTo)}</span></div>
          ${d.comment ? `<div class="r-field"><b>Комментарий:</b> ${escapeHtml(d.comment)}</div>` : ''}
        </div>
        <div class="duty-side">
          <span class="badge ${dutyTone(st)}">${escapeHtml(st)}</span>
          <div class="r-actions">
            ${(own || isSiteAdmin()) && d.status !== 'Отменено' ? `<button class="btn btn-ghost btn-sm" data-action="duty-edit" data-id="${escapeHtml(d.id)}">${isSiteAdmin() ? 'Изменить' : 'Обновить'}</button>` : ''}
            <button class="btn btn-ghost btn-sm" data-action="duty-history" data-id="${escapeHtml(d.id)}">История</button>
            ${isSiteAdmin() ? `<button class="btn btn-ghost btn-sm danger-text" data-action="duty-delete" data-id="${escapeHtml(d.id)}">Удалить</button>` : ''}
          </div>
        </div>
      </div>`; }).join('')}</div>`}`;
  document.getElementById('dutyFactionFilter').addEventListener('change', e => { dutyUI.faction = e.target.value; renderDuties(); });
  document.getElementById('dutyStatusFilter').addEventListener('change', e => { dutyUI.status = e.target.value; renderDuties(); });
}

function openDutyTakeModal(){
  const ids = dutyFactionIds();
  const first = dutyUI.faction || ids[0];
  openModal(`
    <h2>Взять обязанность</h2>
    <p class="sub">Проверяющий: ${escapeHtml(state.user.displayName || state.user.email)}</p>
    <div class="field"><label for="dFaction">Фракция</label><select id="dFaction">${factionOptionsHtml(ids, first)}</select></div>
    <div class="field"><label for="dType">Обязанность</label><select id="dType"></select></div>
    <div class="grid-2">
      <div class="field"><label for="dFrom">Дата от</label><input type="date" id="dFrom" value="${todayISO()}"></div>
      <div class="field"><label for="dTo">Дата до</label><input type="date" id="dTo" value="${todayISO()}"></div>
    </div>
    <div class="field"><label for="dStatus">Статус</label><select id="dStatus">${DUTY_STATUSES.filter(s => s !== 'Просрочено' && s !== 'Отменено').map(s => `<option>${s}</option>`).join('')}</select></div>
    <div class="field"><label for="dComment">Комментарий</label><textarea id="dComment" rows="3" maxlength="2000"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="dSaveBtn" data-action="duty-take-save"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
  const fill = () => {
    const fid = document.getElementById('dFaction').value;
    const types = _dutyTypes.filter(t => t.factionId === fid && t.active !== false);
    document.getElementById('dType').innerHTML = types.length ? types.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('') : '<option value="">Для этой фракции нет типов обязанностей</option>';
  };
  document.getElementById('dFaction').addEventListener('change', fill);
  fill();
}

async function saveDutyTake(){
  const btn = document.getElementById('dSaveBtn');
  const factionId = document.getElementById('dFaction').value;
  const typeId = document.getElementById('dType').value;
  const dateFrom = document.getElementById('dFrom').value;
  const dateTo = document.getElementById('dTo').value;
  const status = document.getElementById('dStatus').value;
  const comment = document.getElementById('dComment').value.trim();
  const type = _dutyTypes.find(t => t.id === typeId);
  if (!factionId || !type){ toast('Выберите фракцию и обязанность', 'error'); return; }
  if (!dateFrom || !dateTo){ toast('Укажите даты', 'error'); return; }
  if (dateTo < dateFrom){ toast('Дата «до» не может быть раньше даты «от»', 'error'); return; }
  setLoading(btn, true);
  try {
    const ref = db.collection('dutyAssignments').doc();
    const batch = db.batch();
    const entry = { at: new Date().toISOString(), byId: state.user.uid, byName: state.user.displayName || state.user.email, status, comment, note: 'Назначение создано' };
    batch.set(ref, {
      typeId, name: type.name, factionId, factionName: factionName(factionId),
      checkerId: state.user.uid, checkerName: state.user.displayName || state.user.email,
      dateFrom, dateTo, status, comment,
      creator: state.user.uid, creatorName: state.user.displayName || state.user.email,
      history: [entry], deleted: false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    addAudit(batch, { action: `Взял обязанность «${type.name}»`, objectType: 'dutyAssignment', objectId: ref.id, newValue: { status, dateFrom, dateTo }, faction: factionId });
    await batch.commit();
    closeModal();
    toast('Обязанность назначена');
    loadDuties();
  } catch (err){
    failToast(err, 'Не удалось сохранить');
  } finally {
    setLoading(btn, false);
  }
}

function openDutyEditModal(id){
  const d = _duties.find(x => x.id === id);
  if (!d) return;
  const admin = isSiteAdmin();
  openModal(`
    <h2>${escapeHtml(d.name)}</h2>
    <p class="sub">${escapeHtml(d.factionName)} · проверяющий ${escapeHtml(d.checkerName)}</p>
    ${admin ? `<div class="grid-2">
      <div class="field"><label for="dFrom">Дата от</label><input type="date" id="dFrom" value="${escapeHtml(d.dateFrom)}"></div>
      <div class="field"><label for="dTo">Дата до</label><input type="date" id="dTo" value="${escapeHtml(d.dateTo)}"></div>
    </div>` : ''}
    <div class="field"><label for="dStatus">Статус</label><select id="dStatus">${DUTY_STATUSES.filter(s => admin || s !== 'Отменено').map(s => `<option${d.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label for="dComment">Комментарий</label><textarea id="dComment" rows="3" maxlength="2000">${escapeHtml(d.comment || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="dSaveBtn" data-action="duty-edit-save" data-id="${escapeHtml(id)}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
}

async function saveDutyEdit(id){
  const d = _duties.find(x => x.id === id);
  if (!d) return;
  const btn = document.getElementById('dSaveBtn');
  const status = document.getElementById('dStatus').value;
  const comment = document.getElementById('dComment').value.trim();
  const patch = { status, comment, updatedAt: FieldValue.serverTimestamp() };
  if (isSiteAdmin()){
    patch.dateFrom = document.getElementById('dFrom').value;
    patch.dateTo = document.getElementById('dTo').value;
    if (!patch.dateFrom || !patch.dateTo || patch.dateTo < patch.dateFrom){ toast('Проверьте даты', 'error'); return; }
  }
  const entry = { at: new Date().toISOString(), byId: state.user.uid, byName: state.user.displayName || state.user.email, status, comment, note: isSiteAdmin() ? 'Изменено администратором сайта' : 'Обновлено проверяющим' };
  patch.history = FieldValue.arrayUnion(entry);
  setLoading(btn, true);
  try {
    const batch = db.batch();
    addVersion(batch, 'dutyAssignment', id, stripSystem(d));
    batch.update(db.collection('dutyAssignments').doc(id), patch);
    addAudit(batch, { action: `Обновил обязанность «${d.name}»`, objectType: 'dutyAssignment', objectId: id, oldValue: { status: d.status, comment: d.comment }, newValue: { status, comment }, faction: d.factionId });
    await batch.commit();
    closeModal();
    toast('Обязанность обновлена');
    loadDuties();
  } catch (err){
    failToast(err, 'Не удалось сохранить');
  } finally {
    setLoading(btn, false);
  }
}

function openDutyHistory(id){
  const d = _duties.find(x => x.id === id);
  if (!d) return;
  const h = Array.isArray(d.history) ? d.history.slice().reverse() : [];
  openModal(`
    <h2>История изменений</h2>
    <p class="sub">${escapeHtml(d.name)} · ${escapeHtml(d.factionName)}</p>
    ${!h.length ? '<div class="hint">История пуста.</div>' : `<div class="timeline">${h.map(e => `
      <div class="tl-item">
        <div class="tl-time mono">${fmtDateTime(e.at)}</div>
        <div class="tl-body"><b>${escapeHtml(e.byName)}</b> · ${escapeHtml(e.note || '')}<br><span class="badge ${dutyTone(e.status)}">${escapeHtml(e.status)}</span>${e.comment ? `<div class="hint">${escapeHtml(e.comment)}</div>` : ''}</div>
      </div>`).join('')}</div>`}
    <div class="modal-actions"><button class="btn btn-ghost" data-action="modal-close">Закрыть</button></div>`);
}

async function deleteDuty(id){
  const d = _duties.find(x => x.id === id);
  if (!d) return;
  const res = await confirmDialog({ title: 'Удалить назначение?', text: `«${d.name}» — ${d.factionName}. Назначение можно будет восстановить.`, reason: true });
  if (!res) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'dutyAssignment', id, stripSystem(d));
    batch.update(db.collection('dutyAssignments').doc(id), { deleted: true, deletedAt: FieldValue.serverTimestamp(), deletedBy: state.user.uid, deletedByEmail: state.user.email, deleteReason: res.reason, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: `Удалил обязанность «${d.name}»`, objectType: 'dutyAssignment', objectId: id, oldValue: { status: d.status, checkerName: d.checkerName }, additionalInfo: res.reason, faction: d.factionId });
    await batch.commit();
    toast('Назначение удалено');
    loadDuties();
  } catch (err){
    failToast(err, 'Не удалось удалить');
  }
}

async function seedDefaultDuties(){
  if (!isSiteAdmin()) return;
  const btn = document.getElementById('seedDutiesBtn');
  setLoading(btn, true);
  try {
    const batch = db.batch();
    let n = 0;
    Object.keys(DUTY_DEFAULTS).forEach(fid => {
      if (!state.factionsById[fid] || _dutyTypes.some(t => t.factionId === fid)) return;
      DUTY_DEFAULTS[fid].forEach(name => {
        const ref = db.collection('dutyTypes').doc();
        batch.set(ref, { name, factionId: fid, description: '', active: true, createdAt: FieldValue.serverTimestamp(), createdBy: state.user.uid, updatedAt: FieldValue.serverTimestamp() });
        n++;
      });
      addAudit(batch, { action: `Добавил стандартные обязанности для ${factionName(fid)}`, objectType: 'dutyType', objectId: fid, newValue: { count: DUTY_DEFAULTS[fid].length }, faction: fid });
    });
    await batch.commit();
    toast(`Добавлено типов обязанностей: ${n}`);
    loadDuties();
  } catch (err){
    failToast(err, 'Не удалось добавить');
  } finally {
    setLoading(btn, false);
  }
}

function openDutyTypesModal(){
  const ids = dutyFactionIds();
  openModal(`
    <h2>Типы обязанностей</h2>
    <div class="grid-2">
      <div class="field"><label for="dtFaction">Фракция</label><select id="dtFaction">${factionOptionsHtml(ids, dutyUI.faction || ids[0])}</select></div>
      <div class="field"><label for="dtName">Название</label><input type="text" id="dtName" maxlength="120" placeholder="Например, Проверить склад"></div>
    </div>
    <div class="field"><label for="dtDesc">Описание</label><input type="text" id="dtDesc" maxlength="300" placeholder="Необязательно"></div>
    <div class="modal-actions"><button class="btn btn-primary" id="dtAddBtn" data-action="duty-type-add"><span class="spinner"></span><span>Добавить тип</span></button></div>
    <div class="type-list" id="dutyTypeList"></div>
    <div class="modal-actions"><button class="btn btn-ghost" data-action="modal-close">Закрыть</button></div>`);
  renderDutyTypeList();
  document.getElementById('dtFaction').addEventListener('change', renderDutyTypeList);
}

function renderDutyTypeList(){
  const el = document.getElementById('dutyTypeList');
  if (!el) return;
  const fid = document.getElementById('dtFaction').value;
  const list = _dutyTypes.filter(t => t.factionId === fid);
  el.innerHTML = !list.length ? '<div class="hint">Для этой фракции типов пока нет.</div>' : list.map(t => `
    <div class="type-row${t.active === false ? ' row-muted' : ''}">
      <span>${escapeHtml(t.name)}${t.description ? `<span class="hint"> — ${escapeHtml(t.description)}</span>` : ''}</span>
      <button class="btn btn-ghost btn-sm" data-action="duty-type-toggle" data-id="${escapeHtml(t.id)}">${t.active === false ? 'Включить' : 'Отключить'}</button>
    </div>`).join('');
}

async function addDutyType(){
  const btn = document.getElementById('dtAddBtn');
  const factionId = document.getElementById('dtFaction').value;
  const name = document.getElementById('dtName').value.trim();
  const description = document.getElementById('dtDesc').value.trim();
  if (!factionId || !name){ toast('Выберите фракцию и введите название', 'error'); return; }
  setLoading(btn, true);
  try {
    const ref = db.collection('dutyTypes').doc();
    const batch = db.batch();
    batch.set(ref, { name, factionId, description, active: true, createdAt: FieldValue.serverTimestamp(), createdBy: state.user.uid, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: `Добавил тип обязанности «${name}»`, objectType: 'dutyType', objectId: ref.id, newValue: { name, description }, faction: factionId });
    await batch.commit();
    _dutyTypes.push({ id: ref.id, name, factionId, description, active: true });
    _dutyTypes.sort(sortByName);
    document.getElementById('dtName').value = '';
    document.getElementById('dtDesc').value = '';
    toast('Тип добавлен');
    renderDutyTypeList();
  } catch (err){
    failToast(err, 'Не удалось добавить тип');
  } finally {
    setLoading(btn, false);
  }
}

async function toggleDutyType(id){
  const t = _dutyTypes.find(x => x.id === id);
  if (!t) return;
  const active = t.active === false;
  try {
    const batch = db.batch();
    batch.update(db.collection('dutyTypes').doc(id), { active, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: `${active ? 'Включил' : 'Отключил'} тип обязанности «${t.name}»`, objectType: 'dutyType', objectId: id, oldValue: { active: !active }, newValue: { active }, faction: t.factionId });
    await batch.commit();
    t.active = active;
    renderDutyTypeList();
  } catch (err){
    failToast(err, 'Не удалось изменить тип');
  }
}
