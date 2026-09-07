let _tickets = [];
let _selectedTicketType = 'bug';
let _supportTab = 'new';
let _editingTicketId = null;
let _replyText = '';
let _titleInput = '';
let _descInput = '';
let _charCount = 0;

function openSupportModal(){
  _selectedTicketType = 'bug';
  _supportTab = 'new';
  _editingTicketId = null;
  _replyText = '';
  _titleInput = '';
  _descInput = '';
  _charCount = 0;
  renderSupportModal();
  loadUserTickets();
}

function renderSupportModal(){
  const isAdmin = isSiteAdmin();
  const html = `
    <h2>Поддержка</h2>
    <div class="support-tabs">
      <button class="btn btn-sm ${_supportTab === 'new' ? 'btn-primary' : ''}" id="supportTabNew">Новая заявка</button>
      <button class="btn btn-sm ${_supportTab === 'history' ? 'btn-primary' : ''}" id="supportTabHistory">История заявок</button>
    </div>
    <div id="supportContent"></div>
  `;
  const modal = openModal(html);
  modal.classList.add('support-modal');
  document.getElementById('supportTabNew').addEventListener('click', () => {
    _supportTab = 'new';
    _editingTicketId = null;
    renderSupportContent();
  });
  document.getElementById('supportTabHistory').addEventListener('click', () => {
    _supportTab = 'history';
    renderSupportContent();
  });
  renderSupportContent();
}

function renderSupportContent(){
  const container = document.getElementById('supportContent');
  if (!container) return;
  if (_supportTab === 'new') {
    const optionsHtml = [
      { value: 'bug', label: 'Баг' },
      { value: 'idea', label: 'Предложение' }
    ].map(opt => `<div class="dropdown-option${_selectedTicketType === opt.value ? ' selected' : ''}" data-value="${opt.value}">${opt.label}</div>`).join('');
    container.innerHTML = `
      <div class="field">
        <label>Тип</label>
        <div class="custom-dropdown" id="tTypeDropdown">
          <div class="dropdown-display">${_selectedTicketType === 'bug' ? 'Баг' : 'Предложение'}</div>
          <div class="dropdown-options">${optionsHtml}</div>
        </div>
      </div>
      <div class="field">
        <label for="tTitle">Заголовок</label>
        <input type="text" id="tTitle" maxlength="120" value="${escapeHtml(_titleInput)}" placeholder="Кратко опишите проблему">
      </div>
      <div class="field">
        <label for="tDesc">Описание</label>
        <textarea id="tDesc" rows="5" maxlength="4000" placeholder="Подробно опишите баг или предложение">${escapeHtml(_descInput)}</textarea>
        <div class="char-count"><span id="charCount">${_charCount}</span>/4000</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="sendTicketBtn">${_editingTicketId ? 'Сохранить изменения' : 'Отправить заявку'}</button>
      </div>`;

    const typeDropdown = document.getElementById('tTypeDropdown');
    if (typeDropdown) {
      const display = typeDropdown.querySelector('.dropdown-display');
      const options = typeDropdown.querySelector('.dropdown-options');
      options.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          _selectedTicketType = opt.dataset.value;
          options.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          display.textContent = opt.textContent;
          options.classList.remove('open');
        });
      });
      display.addEventListener('click', (e) => {
        e.stopPropagation();
        options.classList.toggle('open');
      });
    }

    document.getElementById('tTitle').addEventListener('input', (e) => { _titleInput = e.target.value; });
    document.getElementById('tDesc').addEventListener('input', (e) => {
      _descInput = e.target.value;
      _charCount = e.target.value.length;
      document.getElementById('charCount').textContent = _charCount;
    });
    document.getElementById('sendTicketBtn').addEventListener('click', () => {
      if (_editingTicketId) {
        updateTicket(_editingTicketId);
      } else {
        createTicket();
      }
    });
  } else {
    container.innerHTML = `<div id="ticketsList"><div class="hint">Загрузка...</div></div>`;
    loadUserTickets();
  }
}

async function createTicket(){
  const title = document.getElementById('tTitle').value.trim();
  const description = document.getElementById('tDesc').value.trim();
  if (title.length < 5 || description.length < 5) {
    toast('Минимальная длина заголовка и описания — 5 символов', 'error');
    return;
  }
  try {
    await db.collection('supportTickets').add({
      type: _selectedTicketType,
      title,
      description,
      status: 'В обработке',
      comments: [],
      authorId: state.user.uid,
      authorEmail: state.user.email,
      authorNickname: state.user.displayName || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deleted: false
    });
    toast('Заявка отправлена');
    closeModal();
  } catch (err) {
    failToast(err, 'Не удалось отправить заявку');
  }
}

async function updateTicket(ticketId){
  const title = document.getElementById('tTitle').value.trim();
  const description = document.getElementById('tDesc').value.trim();
  if (title.length < 5 || description.length < 5) {
    toast('Минимальная длина заголовка и описания — 5 символов', 'error');
    return;
  }
  try {
    await db.collection('supportTickets').doc(ticketId).update({
      title,
      description,
      updatedAt: FieldValue.serverTimestamp()
    });
    toast('Заявка обновлена');
    closeModal();
  } catch (err) {
    failToast(err, 'Не удалось обновить заявку');
  }
}

async function loadUserTickets(){
  if (!isSignedIn()) return;
  const container = document.getElementById('ticketsList');
  if (!container) return;
  container.innerHTML = '<div class="hint">Загрузка...</div>';
  try {
    let q;
    if (isSiteAdmin()) {
      q = db.collection('supportTickets').where('deleted', '==', false);
    } else {
      q = db.collection('supportTickets')
        .where('authorId', '==', state.user.uid)
        .where('deleted', '==', false);
    }
    const snap = await q.orderBy('createdAt', 'desc').limit(100).get();
    _tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTicketsList();
  } catch (err) {
    console.error('Загрузка заявок', err);
    container.innerHTML = errorState('Не удалось загрузить заявки. ' + humanError(err));
  }
}

function renderTicketsList(){
  const container = document.getElementById('ticketsList');
  if (!container) return;
  if (!_tickets.length) {
    container.innerHTML = emptyState('У вас пока нет заявок.');
    return;
  }
  const isAdmin = isSiteAdmin();
  container.innerHTML = _tickets.map(ticket => {
    const statusClass = ticketStatusClass(ticket.status);
    return `
      <div class="ticket-item" data-id="${escapeHtml(ticket.id)}">
        <div class="ticket-header">
          <span class="badge ${statusClass}">${escapeHtml(ticket.status)}</span>
          <span class="ticket-title">${escapeHtml(ticket.title)}</span>
          <span class="ticket-date mono">${fmtDateTime(ticket.createdAt)}</span>
          ${isAdmin ? `<span class="hint">${escapeHtml(ticket.authorNickname || ticket.authorEmail)}</span>` : ''}
        </div>
        <div class="ticket-body">
          <div class="ticket-message">
            <div class="msg-author">${escapeHtml(ticket.authorNickname || ticket.authorEmail)}</div>
            <div class="msg-text">${escapeHtml(ticket.description)}</div>
          </div>
          ${ticket.comments.map(c => `
            <div class="ticket-message ${c.authorId === state.user.uid ? 'own' : 'admin'}">
              <div class="msg-author">${escapeHtml(c.authorName)} ${c.authorRole ? `<span class="hint">(${escapeHtml(c.authorRole)})</span>` : ''}</div>
              <div class="msg-text">${escapeHtml(c.text)}</div>
              <div class="msg-date mono">${fmtDateTime(c.createdAt)}</div>
            </div>`).join('')}
        </div>
        <div class="ticket-actions">
          ${ticket.status === 'В обработке' && !isAdmin ? `
            <button class="btn btn-ghost btn-sm" data-action="support-edit" data-id="${escapeHtml(ticket.id)}">Редактировать</button>
            <button class="btn btn-ghost btn-sm danger-text" data-action="support-cancel" data-id="${escapeHtml(ticket.id)}">Отменить</button>
          ` : ''}
          ${ticket.status === 'Уточнение' && (isAdmin || ticket.authorId === state.user.uid) ? `
            <button class="btn btn-ghost btn-sm" data-action="support-reply" data-id="${escapeHtml(ticket.id)}">Ответить</button>
          ` : ''}
          ${isAdmin ? `
            <button class="btn btn-ghost btn-sm" data-action="support-respond" data-id="${escapeHtml(ticket.id)}">Ответить как администратор</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleSupportAction(btn.dataset.action, btn.dataset.id));
  });
}

function handleSupportAction(action, ticketId){
  const ticket = _tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  switch(action){
    case 'support-edit':
      startEditTicket(ticket);
      break;
    case 'support-cancel':
      cancelTicket(ticketId);
      break;
    case 'support-reply':
      openReplyModal(ticket, false);
      break;
    case 'support-respond':
      openReplyModal(ticket, true);
      break;
  }
}

function startEditTicket(ticket){
  _editingTicketId = ticket.id;
  _titleInput = ticket.title;
  _descInput = ticket.description;
  _charCount = ticket.description.length;
  _selectedTicketType = ticket.type;
  _supportTab = 'new';
  renderSupportContent();
}

function cancelTicket(ticketId){
  confirmDialog({
    title: 'Отменить заявку?',
    text: 'Она будет удалена и не попадёт на рассмотрение. Действие необратимо.',
    okText: 'Отменить',
    danger: true
  }).then(ok => {
    if (!ok) return;
    db.collection('supportTickets').doc(ticketId).update({
      deleted: true,
      updatedAt: FieldValue.serverTimestamp()
    }).then(() => {
      toast('Заявка отменена');
      loadUserTickets();
    }).catch(err => failToast(err, 'Не удалось отменить заявку'));
  });
}

function openReplyModal(ticket, isAdmin){
  _replyText = '';
  const html = `
    <h2>${isAdmin ? 'Ответить как администратор' : 'Ответить'}</h2>
    <p class="sub">${escapeHtml(ticket.title)}</p>
    <div class="field">
      <label for="replyText">Сообщение</label>
      <textarea id="replyText" rows="5" maxlength="4000">${escapeHtml(_replyText)}</textarea>
      <div class="char-count"><span id="replyCount">0</span>/4000</div>
    </div>
    ${isAdmin ? `
      <div class="field">
        <label>Статус</label>
        <div class="custom-dropdown" id="statusDropdown">
          <div class="dropdown-display">${ticket.status}</div>
          <div class="dropdown-options">
            ${['Уточнение','Рассмотрено','Отклонено'].map(s => `<div class="dropdown-option${ticket.status === s ? ' selected' : ''}" data-value="${s}">${s}</div>`).join('')}
          </div>
        </div>
      </div>
    ` : ''}
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="sendReplyBtn">Отправить</button>
    </div>`;
  const modal = openModal(html);
  modal.classList.add('support-modal');

  document.getElementById('replyText').addEventListener('input', (e) => {
    _replyText = e.target.value;
    document.getElementById('replyCount').textContent = e.target.value.length;
  });

  if (isAdmin) {
    const statusDropdown = document.getElementById('statusDropdown');
    if (statusDropdown) {
      const display = statusDropdown.querySelector('.dropdown-display');
      const options = statusDropdown.querySelector('.dropdown-options');
      let selectedStatus = ticket.status;
      options.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedStatus = opt.dataset.value;
          options.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          display.textContent = opt.textContent;
          options.classList.remove('open');
        });
      });
      display.addEventListener('click', (e) => {
        e.stopPropagation();
        options.classList.toggle('open');
      });
      document.getElementById('sendReplyBtn').addEventListener('click', () => {
        sendReply(ticket, _replyText, isAdmin, selectedStatus);
      });
    }
  } else {
    document.getElementById('sendReplyBtn').addEventListener('click', () => {
      sendReply(ticket, _replyText, false, ticket.status);
    });
  }
}

async function sendReply(ticket, text, isAdmin, newStatus){
  if (text.trim().length < 5) {
    toast('Минимальная длина сообщения — 5 символов', 'error');
    return;
  }
  const comment = {
    authorId: state.user.uid,
    authorName: state.user.displayName || state.user.email,
    authorRole: isAdmin ? roleLabel(state.user) : '',
    text: text.trim(),
    createdAt: FieldValue.serverTimestamp()
  };
  try {
    const ticketRef = db.collection('supportTickets').doc(ticket.id);
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ticketRef);
      if (!doc.exists) throw new Error('Заявка не найдена');
      const data = doc.data();
      const comments = data.comments || [];
      comments.push(comment);
      transaction.update(ticketRef, {
        comments,
        status: isAdmin ? newStatus : 'Уточнение',
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    toast('Ответ отправлен');
    closeModal();
    loadUserTickets();
  } catch (err) {
    failToast(err, 'Не удалось отправить ответ');
  }
}

function ticketStatusClass(status){
  switch(status){
    case 'Рассмотрено': return 'badge-green';
    case 'Отклонено': return 'badge-red';
    case 'Уточнение': return 'badge-yellow';
    default: return 'badge-grey';
  }
}
