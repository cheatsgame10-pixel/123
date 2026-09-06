let _tickets = [];

async function loadTickets(){
  const root = document.getElementById('supportRoot');
  if (!isSignedIn()){ root.innerHTML = lockedState('Войдите, чтобы отправить заявку.'); return; }
  root.innerHTML = skeletonRows(4);
  try {
    let q = db.collection('supportTickets').where('deleted', '==', false);
    if (!isSiteAdmin()) q = q.where('authorId', '==', state.user.uid);
    const snap = await q.limit(200).get();
    _tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _tickets.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    renderTickets();
  } catch (err){
    console.error('Поддержка', err);
    root.innerHTML = errorState('Не удалось загрузить заявки. ' + humanError(err), 'retry-support');
  }
}

function ticketTone(status){
  if (status === 'Одобрено') return 'badge-green';
  if (status === 'Отклонено') return 'badge-red';
  return 'badge-yellow';
}

function renderTickets(){
  const root = document.getElementById('supportRoot');
  const pending = _tickets.filter(t => t.status === 'На рассмотрении').length;
  root.innerHTML = `
    <div class="report-layout">
      <div class="card form-card">
        <h3>Новая заявка</h3>
        <div class="field"><label for="tType">Тип</label><select id="tType">${Object.keys(TICKET_TYPES).map(k => `<option value="${k}">${TICKET_TYPES[k]}</option>`).join('')}</select></div>
        <div class="field"><label for="tTitle">Заголовок</label><input type="text" id="tTitle" maxlength="120" placeholder="Коротко, в чём суть"></div>
        <div class="field"><label for="tDesc">Описание</label><textarea id="tDesc" rows="6" maxlength="4000" placeholder="Опишите баг или предложение подробно"></textarea></div>
        <button class="btn btn-primary btn-block" id="tSendBtn" data-action="ticket-send"><span class="spinner"></span><span>Отправить</span></button>
      </div>
      <div class="card list-card">
        <div class="list-head"><h3>${isSiteAdmin() ? 'Все заявки' : 'Мои заявки'}</h3><span class="count-pill">${_tickets.length}</span>${isSiteAdmin() && pending ? `<span class="badge badge-yellow">на рассмотрении: ${pending}</span>` : ''}</div>
        ${!_tickets.length ? emptyState('Заявок пока нет.') : _tickets.map(t => `
          <div class="report-item">
            <div class="r-top">
              <div>
                <div class="r-name"><span class="chip chip-sm">${escapeHtml(TICKET_TYPES[t.type] || t.type)}</span> ${escapeHtml(t.title)}</div>
                <div class="r-meta">${fmtDateTime(t.createdAt)}${isSiteAdmin() ? ' · ' + escapeHtml(t.authorNickname || t.authorEmail) : ''}</div>
              </div>
              <span class="badge ${ticketTone(t.status)}">${escapeHtml(t.status)}</span>
            </div>
            <div class="r-field">${escapeHtml(t.description)}</div>
            ${t.adminResponse ? `<div class="r-field admin-reply"><b>Ответ администратора:</b> ${escapeHtml(t.adminResponse)}</div>` : ''}
            ${isSiteAdmin() ? `<div class="ai-actions"><button class="btn btn-ghost btn-sm" data-action="ticket-respond" data-id="${escapeHtml(t.id)}">Ответить</button><button class="btn btn-ghost btn-sm danger-text" data-action="ticket-delete" data-id="${escapeHtml(t.id)}">Удалить</button></div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

async function sendTicket(){
  const btn = document.getElementById('tSendBtn');
  const type = document.getElementById('tType').value;
  const title = document.getElementById('tTitle').value.trim();
  const description = document.getElementById('tDesc').value.trim();
  if (!title || !description){ toast('Заполните заголовок и описание', 'error'); return; }
  setLoading(btn, true);
  try {
    await db.collection('supportTickets').add({
      type, title, description,
      status: 'На рассмотрении',
      adminResponse: '',
      authorId: state.user.uid, authorEmail: state.user.email, authorNickname: state.user.displayName || '',
      deleted: false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    toast('Заявка отправлена');
    loadTickets();
  } catch (err){
    failToast(err, 'Не удалось отправить заявку');
  } finally {
    setLoading(btn, false);
  }
}

function openTicketModal(id){
  const t = _tickets.find(x => x.id === id);
  if (!t) return;
  openModal(`
    <h2>${escapeHtml(t.title)}</h2>
    <p class="sub">${escapeHtml(TICKET_TYPES[t.type] || t.type)} · ${escapeHtml(t.authorNickname || t.authorEmail)} · ${fmtDateTime(t.createdAt)}</p>
    <div class="r-field quoted">${escapeHtml(t.description)}</div>
    <div class="field"><label for="tStatus">Статус</label><select id="tStatus">${TICKET_STATUSES.map(s => `<option${t.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label for="tReply">Ответ администратора</label><textarea id="tReply" rows="4" maxlength="4000">${escapeHtml(t.adminResponse || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="tSaveBtn" data-action="ticket-save" data-id="${escapeHtml(id)}"><span class="spinner"></span><span>Сохранить</span></button>
    </div>`);
}

async function saveTicketResponse(id){
  const t = _tickets.find(x => x.id === id);
  if (!t) return;
  const btn = document.getElementById('tSaveBtn');
  const status = document.getElementById('tStatus').value;
  const adminResponse = document.getElementById('tReply').value.trim();
  setLoading(btn, true);
  try {
    const batch = db.batch();
    batch.update(db.collection('supportTickets').doc(id), { status, adminResponse, respondedAt: FieldValue.serverTimestamp(), respondedBy: state.user.uid, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: `Ответил на заявку поддержки, статус «${status}»`, objectType: 'supportTicket', objectId: id, oldValue: { status: t.status }, newValue: { status }, additionalInfo: t.title });
    await batch.commit();
    closeModal();
    toast('Ответ сохранён');
    loadTickets();
  } catch (err){
    failToast(err, 'Не удалось сохранить ответ');
  } finally {
    setLoading(btn, false);
  }
}

async function deleteTicket(id){
  const t = _tickets.find(x => x.id === id);
  if (!t) return;
  const res = await confirmDialog({ title: 'Удалить заявку?', text: `«${t.title}». Заявку можно будет восстановить в разделе «Восстановление».`, reason: true });
  if (!res) return;
  try {
    const batch = db.batch();
    addVersion(batch, 'supportTicket', id, stripSystem(t));
    batch.update(db.collection('supportTickets').doc(id), { deleted: true, deletedAt: FieldValue.serverTimestamp(), deletedBy: state.user.uid, deletedByEmail: state.user.email, deleteReason: res.reason, updatedAt: FieldValue.serverTimestamp() });
    addAudit(batch, { action: 'Удалил заявку поддержки', objectType: 'supportTicket', objectId: id, oldValue: { title: t.title, status: t.status }, additionalInfo: res.reason });
    await batch.commit();
    toast('Заявка удалена');
    loadTickets();
  } catch (err){
    failToast(err, 'Не удалось удалить заявку');
  }
}
