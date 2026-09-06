let _news = [];

async function loadNews(){
  const root = document.getElementById('newsRoot');
  if (!isSignedIn()){ root.innerHTML = lockedState('Войдите, чтобы читать новости.'); return; }
  root.innerHTML = skeletonRows(4);
  try {
    const snap = await db.collection('news').where('deleted', '==', false).limit(100).get();
    _news = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _news.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    renderNews();
  } catch (err){
    console.error('Новости', err);
    root.innerHTML = errorState('Не удалось загрузить новости. ' + humanError(err), 'retry-news');
  }
}

function renderNews(){
  const root = document.getElementById('newsRoot');
  root.innerHTML = `
    ${isSiteAdmin() ? `<div class="toolbar"><div class="toolbar-note">Новостей: ${_news.length}</div><button class="btn btn-primary" data-action="news-create">Написать новость</button></div>` : ''}
    ${!_news.length ? emptyState('Новостей пока нет.') : `<div class="news-list">${_news.map(n => `
      <article class="news-item">
        <div class="news-head">
          ${avatarHtml(n.authorAvatar, n.authorNickname, 'avatar-sm')}
          <div class="news-meta">
            <div class="news-author">${escapeHtml(n.authorNickname || n.authorEmail)}</div>
            <div class="news-date mono">${fmtDateTime(n.createdAt)}${n.updatedAt && n.editedAt ? ' · изменено ' + fmtDateTime(n.editedAt) : ''}</div>
          </div>
          ${isSiteAdmin() ? `<div class="r-actions"><button class="btn btn-ghost btn-sm" data-action="news-edit" data-id="${escapeHtml(n.id)}">Изменить</button><button class="btn btn-ghost btn-sm danger-text" data-action="news-delete" data-id="${escapeHtml(n.id)}">Удалить</button></div>` : ''}
        </div>
        <h3 class="news-title">${escapeHtml(n.title)}</h3>
        <div class="news-text">${escapeHtml(n.text)}</div>
      </article>`).join('')}</div>`}`;
}

function openNewsModal(id){
  const n = id ? _news.find(x => x.id === id) : null;
  openModal(`
    <h2>${n ? 'Изменить новость' : 'Новая новость'}</h2>
    <div class="field"><label for="nTitle">Заголовок</label><input type="text" id="nTitle" maxlength="150" value="${escapeHtml(n ? n.title : '')}"></div>
    <div class="field"><label for="nText">Текст</label><textarea id="nText" rows="8" maxlength="8000">${escapeHtml(n ? n.text : '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="nSaveBtn" data-action="news-save" data-id="${escapeHtml(n ? n.id : '')}"><span class="spinner"></span><span>Опубликовать</span></button>
    </div>`);
}

async function saveNews(id){
  const btn = document.getElementById('nSaveBtn');
  const title = document.getElementById('nTitle').value.trim();
  const text = document.getElementById('nText').value.trim();
  if (!title || !text){ toast('Заполните заголовок и текст', 'error'); return; }
  setLoading(btn, true);
  try {
    const batch = db.batch();
    if (id){
      const old = _news.find(x => x.id === id);
      addVersion(batch, 'news', id, stripSystem(old));
      batch.update(db.collection('news').doc(id), { title, text, editedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      addAudit(batch, { action: 'Изменил новость', objectType: 'news', objectId: id, oldValue: { title: old.title }, newValue: { title } });
    } else {
      const ref = db.collection('news').doc();
      batch.set(ref, {
        title, text,
        authorId: state.user.uid, authorEmail: state.user.email, authorNickname: state.user.displayName || '', authorAvatar: state.user.avatarUrl || '',
        deleted: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      addAudit(batch, { action: 'Опубликовал новость', objectType: 'news', objectId: ref.id, newValue: { title } });
    }
    await batch.commit();
    closeModal();
    toast(id ? 'Новость обновлена' : 'Новость опубликована');
    loadNews();
  } catch (err){
    failToast(err, 'Не удалось сохранить новость');
  } finally {
    setLoading(btn, false);
  }
}

async function deleteNews(id){
  const n = _news.find(x => x.id === id);
  if (!n) return;
  const res = await confirmDialog({ title: 'Удалить новость?', text: `«${n.title}». Новость скроется, но её можно восстановить в разделе «Восстановление».`, reason: true });
  if (!res) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'news', id, stripSystem(n));
    batch.update(db.collection('news').doc(id), { deleted: true, deletedAt: FieldValue.serverTimestamp(), deletedBy: state.user.uid, deletedByEmail: state.user.email, deleteReason: res.reason, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: 'Удалил новость', objectType: 'news', objectId: id, oldValue: { title: n.title }, additionalInfo: res.reason });
    await batch.commit();
    toast('Новость удалена');
    loadNews();
  } catch (err){
    failToast(err, 'Не удалось удалить новость');
  }
}
