async function loadFactions(){
  try {
    const snap = await db.collection('factions').get();
    state.factions = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByName);
  } catch (err){
    console.error('Фракции', err);
    state.factions = [];
  }
  state.factionsById = {};
  state.factionsByForumKey = {};
  state.factions.forEach(f => {
    state.factionsById[f.id] = f;
    if (f.forumKey) state.factionsByForumKey[f.forumKey] = f;
  });
}

function factionName(id){
  const f = state.factionsById[id];
  return f ? f.name : (id || '—');
}

function factionByForumKey(key){
  return state.factionsByForumKey[key] || null;
}

function factionSide(f){
  return SIDE_GOV.includes(f?.category) ? 'gov' : 'crime';
}

function unmappedForumKeys(){
  if (!state.forum) return [];
  return Object.keys(state.forum).filter(k => !state.factionsByForumKey[k]);
}

function factionOptionsHtml(ids, selected){
  const list = ids.map(id => state.factionsById[id]).filter(Boolean).sort(sortByName);
  return list.map(f => `<option value="${escapeHtml(f.id)}"${f.id === selected ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
}

function factionGroupedOptionsHtml(selected, includeEmpty){
  const groups = {};
  state.factions.filter(f => f.active !== false).forEach(f => (groups[f.category || 'other'] ??= []).push(f));
  return (includeEmpty ? `<option value="">${escapeHtml(includeEmpty)}</option>` : '') +
    CATEGORY_ORDER.filter(c => groups[c]).map(c =>
      `<optgroup label="${escapeHtml(CATEGORY_NAMES[c])}">${groups[c].sort(sortByName).map(f =>
        `<option value="${escapeHtml(f.id)}"${f.id === selected ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}</optgroup>`).join('');
}

async function syncFactionsFromForum(){
  if (!isSiteAdmin()) return;
  const missing = unmappedForumKeys();
  if (!missing.length){ toast('Все фракции с форума уже добавлены'); return; }
  const btn = document.getElementById('syncFactionsBtn');
  setLoading(btn, true);
  try {
    const batch = db.batch();
    const used = new Set(state.factions.map(f => f.id));
    missing.forEach(key => {
      let id = slugify(key);
      let n = 2;
      while (used.has(id)) id = slugify(key) + '-' + (n++);
      used.add(id);
      const entry = state.forum[key];
      const data = {
        name: key,
        forumKey: key,
        category: CATEGORY_ORDER.includes(entry.category) ? entry.category : 'other',
        logoUrl: '',
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: state.user.uid,
        updatedAt: FieldValue.serverTimestamp()
      };
      batch.set(db.collection('factions').doc(id), data);
      addAudit(batch, { action: 'Добавил фракцию из данных форума', objectType: 'faction', objectId: id, newValue: { name: key, category: data.category }, faction: id });
    });
    await batch.commit();
    toast(`Добавлено фракций: ${missing.length}`);
    await loadFactions();
    renderFactionsSection();
    renderLeaders();
  } catch (err){
    failToast(err, 'Не удалось добавить фракции');
  } finally {
    setLoading(btn, false);
  }
}

function renderFactionsSection(){
  const root = document.getElementById('factionsRoot');
  if (!isSiteAdmin()){ root.innerHTML = lockedState('Раздел доступен только администратору сайта.'); return; }
  const missing = unmappedForumKeys();
  const rows = state.factions;
  root.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-note">${rows.length ? `Фракций: ${rows.length}` : 'Фракции ещё не добавлены'}${missing.length ? ` · на форуме есть ещё ${missing.length}, которых нет в базе` : ''}</div>
      <div class="toolbar-right">
        <button class="btn btn-primary" id="syncFactionsBtn" data-action="sync-factions" ${state.forum ? '' : 'disabled'}><span class="spinner"></span><span>Добавить фракции с форума</span></button>
        <button class="btn" data-action="faction-create">Создать вручную</button>
      </div>
    </div>
    ${rows.length ? `
    <div class="card table-card">
      <table class="data-table">
        <thead><tr><th></th><th>Название</th><th>Ключ на форуме</th><th>Категория</th><th>ID</th><th>Статус</th><th></th></tr></thead>
        <tbody>${rows.map(f => `
          <tr class="${f.active === false ? 'row-muted' : ''}">
            <td>${f.logoUrl ? `<img class="faction-logo-sm" src="${escapeHtml(f.logoUrl)}" alt="">` : `<div class="faction-logo-sm faction-logo-empty">${escapeHtml(initialsOf(f.name))}</div>`}</td>
            <td><b>${escapeHtml(f.name)}</b></td>
            <td class="mono">${escapeHtml(f.forumKey || '—')}</td>
            <td>${escapeHtml(CATEGORY_NAMES[f.category] || 'Другое')}</td>
            <td class="mono">${escapeHtml(f.id)}</td>
            <td>${f.active === false ? '<span class="badge badge-grey">Неактивна</span>' : '<span class="badge badge-green">Активна</span>'}</td>
            <td class="td-actions"><button class="btn btn-ghost btn-sm" data-action="faction-edit" data-id="${escapeHtml(f.id)}">Изменить</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : emptyState('Нажмите «Добавить фракции с форума», чтобы создать записи со стабильными ID.')}`;
}

function openFactionModal(id){
  const f = id ? state.factionsById[id] : null;
  const forumKeys = state.forum ? Object.keys(state.forum).sort((a, b) => a.localeCompare(b, 'ru')) : [];
  const activeChecked = f && f.active !== false ? 'checked' : '';
  const disabledAttr = f ? '' : 'disabled'; // для новой фракции показываем toggle, но он всегда активен по умолчанию
  openModal(`
    <h2>${f ? 'Фракция' : 'Новая фракция'}</h2>
    <div class="field"><label for="fName">Название</label><input type="text" id="fName" maxlength="80" value="${escapeHtml(f ? f.name : '')}" placeholder="Например, LSPD"></div>
    <div class="field"><label for="fForumKey">Ключ на форуме</label>
      <input list="forumKeysList" type="text" id="fForumKey" maxlength="80" value="${escapeHtml(f ? f.forumKey || '' : '')}" placeholder="Название строки в таблице форума">
      <datalist id="forumKeysList">${forumKeys.map(k => `<option value="${escapeHtml(k)}"></option>`).join('')}</datalist>
    </div>
    <div class="field"><label for="fCategory">Категория</label><select id="fCategory">${CATEGORY_ORDER.map(c => `<option value="${c}"${(f ? f.category : 'other') === c ? ' selected' : ''}>${CATEGORY_NAMES[c]}</option>`).join('')}</select></div>
    ${f ? `
      <div class="field">
        <label class="toggle-label">
          <span class="toggle-label-text">Фракция активна</span>
          <label class="toggle">
            <input type="checkbox" id="fActive" ${activeChecked}>
            <span class="slider"></span>
          </label>
        </label>
      </div>
    ` : `
      <div class="field"><label for="fId">ID (нельзя изменить после создания)</label><input type="text" id="fId" maxlength="60" placeholder="Заполнится автоматически из названия"></div>
    `}
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="fSaveBtn" data-action="faction-save" data-id="${escapeHtml(f ? f.id : '')}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
  if (!f){
    document.getElementById('fName').addEventListener('input', e => {
      document.getElementById('fId').value = slugify(e.target.value);
    });
  }
}

async function saveFaction(id){
  const btn = document.getElementById('fSaveBtn');
  const name = document.getElementById('fName').value.trim();
  const forumKey = document.getElementById('fForumKey').value.trim();
  const category = document.getElementById('fCategory').value;
  if (!name){ toast('Введите название фракции', 'error'); return; }
  setLoading(btn, true);
  try {
    const batch = db.batch();
    if (id){
      const old = state.factionsById[id];
      const active = document.getElementById('fActive').checked;
      const patch = { name, forumKey, category, active, updatedAt: FieldValue.serverTimestamp() };
      addVersion(batch, 'faction', id, stripSystem(old));
      batch.update(db.collection('factions').doc(id), patch);
      addAudit(batch, { action: 'Изменил данные фракции', objectType: 'faction', objectId: id, oldValue: { name: old.name, forumKey: old.forumKey, category: old.category, active: old.active }, newValue: { name, forumKey, category, active }, faction: id });
    } else {
      let newId = (document.getElementById('fId').value.trim() || slugify(name)).toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!newId){ toast('ID может содержать только латиницу, цифры и дефис', 'error'); setLoading(btn, false); return; }
      if (state.factionsById[newId]){ toast('Фракция с таким ID уже существует', 'error'); setLoading(btn, false); return; }
      id = newId;
      batch.set(db.collection('factions').doc(id), {
        name, forumKey, category, logoUrl: '', active: true,
        createdAt: FieldValue.serverTimestamp(), createdBy: state.user.uid, updatedAt: FieldValue.serverTimestamp()
      });
      addAudit(batch, { action: 'Создал фракцию', objectType: 'faction', objectId: id, newValue: { name, forumKey, category }, faction: id });
    }
    await batch.commit();
    closeModal();
    toast('Фракция сохранена');
    await loadFactions();
    renderFactionsSection();
    renderLeaders();
  } catch (err){
    failToast(err, 'Не удалось сохранить фракцию');
  } finally {
    setLoading(btn, false);
  }
}

function validateImage(file){
  if (!IMAGE_TYPES.includes(file.type)) throw { code: 'storage/invalid-format' };
  if (file.size > AVATAR_MAX_BYTES) throw { code: 'file-too-large' };
}
ERROR_MESSAGES['file-too-large'] = 'Файл больше 3 МБ. Выберите изображение поменьше.';
