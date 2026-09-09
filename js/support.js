let _tickets = [];
let _selectedTicketType = 'bug';
let _supportTab = 'new';
let _editingTicketId = null;
let _replyText = '';
let _titleInput = '';
let _descInput = '';
let _charCount = 0;
let _unreadCount = 0;
let _editingComment = null;
let _supportUnsub = null;
let _globalUnreadUnsub = null;
let _notifiedTickets = new Set();
let _globalNotifiedTickets = new Set();
let _editCommentStatus = '';
let _isSubmitting = false;
let _ticketsLimit = 20;
let _hasMoreTickets = false;
let _supportSearch = '';
let _supportStatusFilter = '';
let _supportTypeFilter = '';

function initGlobalSupportUnreadListener(){
  if (_globalUnreadUnsub) { _globalUnreadUnsub(); _globalUnreadUnsub = null; }
  if (!isSignedIn()) { _unreadCount = 0; renderUnreadBadge(); return; }
  let query;
  if (isSiteAdmin()) {
    query = db.collection('supportTickets')
      .where('deleted', '==', false);
  } else {
    query = db.collection('supportTickets')
      .where('authorId', '==', state.user.uid)
      .where('deleted', '==', false);
  }
  _globalUnreadUnsub = query.onSnapshot(snap => {
    let count = 0;
    snap.forEach(doc => {
      const data = doc.data();
      const key = `${isSiteAdmin() ? 'admin' : 'user'}:${doc.id}`;
      const unread = isSiteAdmin()
        ? (data.adminUnread === true || (data.adminUnread == null && data.status === 'В обработке')) && data.archived !== true
        : data.userUnread === true;
      if (unread) {
        count++;
        if (!_globalNotifiedTickets.has(key)) {
          _globalNotifiedTickets.add(key);
          toast(isSiteAdmin() ? 'Новое сообщение в поддержке' : 'У вас есть новый ответ от администратора');
        }
      } else {
        _globalNotifiedTickets.delete(key);
      }
    });
    _unreadCount = count;
    renderUnreadBadge();
  }, err => {
    console.error('Глобальный слушатель непрочитанных', err);
  });
}

function stopGlobalSupportUnreadListener(){
  if (_globalUnreadUnsub) {
    _globalUnreadUnsub();
    _globalUnreadUnsub = null;
  }
  _globalNotifiedTickets.clear();
}

function openSupportModal(){
  if (!isSignedIn()) {
    toast('Войдите, чтобы открыть поддержку', 'error');
    return;
  }
  _selectedTicketType = 'bug';
  _supportTab = 'new';
  _editingTicketId = null;
  _replyText = '';
  _titleInput = '';
  _descInput = '';
  _charCount = 0;
  _editingComment = null;
  _notifiedTickets.clear();
  _ticketsLimit = 20;
  _hasMoreTickets = false;
  _supportSearch = '';
  _supportStatusFilter = '';
  _supportTypeFilter = '';
  _tickets = [];
  renderSupportModal();
  startSupportListeners();
}

function renderSupportModal(){
  const isAdmin = isSiteAdmin();
  const tabsHtml = `
    <button class="btn btn-sm ${_supportTab === 'new' ? 'btn-primary' : ''}" id="supportTabNew">Новая заявка</button>
    <button class="btn btn-sm ${_supportTab === 'history' ? 'btn-primary' : ''}" id="supportTabHistory">
      История заявок
      <span id="supportHistoryBadge" class="support-badge support-badge-inline" hidden>0</span>
    </button>
    ${isAdmin ? `<button class="btn btn-sm ${_supportTab === 'archive' ? 'btn-primary' : ''}" id="supportTabArchive">Архив</button>` : ''}
  `;
  const html = `
    <h2>Поддержка</h2>
    <div class="support-tabs">${tabsHtml}</div>
    <div id="supportContent"></div>
  `;
  const modal = openModal(html);
  modal.classList.add('support-modal');

  updateUnreadBadge();

  document.getElementById('supportTabNew').addEventListener('click', () => {
    _supportTab = 'new';
    _editingTicketId = null;
    _tickets = [];
    renderSupportContent();
  });
  document.getElementById('supportTabHistory').addEventListener('click', () => {
    _supportTab = 'history';
    _tickets = [];
    _ticketsLimit = 20;
    _hasMoreTickets = false;
    renderSupportContent();
    if (isSiteAdmin()) markAdminTicketsAsRead();
    else markTicketsAsRead();
    startSupportListeners();
  });
  const archiveBtn = document.getElementById('supportTabArchive');
  if (archiveBtn) {
    archiveBtn.addEventListener('click', () => {
      _supportTab = 'archive';
      _tickets = [];
      _ticketsLimit = 20;
      _hasMoreTickets = false;
      renderSupportContent();
      startSupportListeners();
    });
  }
  modal.querySelectorAll('[data-action="modal-close"]').forEach(btn => {
    btn.addEventListener('click', stopSupportListeners);
  });
  renderSupportContent();
}

function updateSupportTabs(){
  const newTabBtn = document.getElementById('supportTabNew');
  const histTabBtn = document.getElementById('supportTabHistory');
  const archTabBtn = document.getElementById('supportTabArchive');
  if (newTabBtn) newTabBtn.classList.toggle('btn-primary', _supportTab === 'new');
  if (histTabBtn) histTabBtn.classList.toggle('btn-primary', _supportTab === 'history');
  if (archTabBtn) archTabBtn.classList.toggle('btn-primary', _supportTab === 'archive');
}

function renderSupportContent(){
  const container = document.getElementById('supportContent');
  if (!container) return;
  const supportModal = container.closest('.modal.support-modal');
  supportModal?.classList.toggle('support-new-modal', _supportTab === 'new');
  container.className = _supportTab === 'new' ? 'support-content support-content-scroll' : 'support-content support-content-list';
  if (_supportTab === 'new') {
    const optionsHtml = [
      { value: 'bug', label: 'Баг' },
      { value: 'idea', label: 'Предложение' }
    ].map(opt => `<div class="dropdown-option${_selectedTicketType === opt.value ? ' selected' : ''}" data-value="${opt.value}">${opt.label}</div>`).join('');
    const titlePlaceholder = _selectedTicketType === 'bug' ? 'Кратко опишите проблему' : 'Кратко опишите предложение';
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
        <input type="text" id="tTitle" maxlength="20" value="${escapeHtml(_titleInput)}" placeholder="${escapeHtml(titlePlaceholder)}">
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
      const titleInput = document.getElementById('tTitle');
      options.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          _selectedTicketType = opt.dataset.value;
          options.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          display.textContent = opt.textContent;
          options.classList.remove('open');
          if (titleInput) {
            titleInput.placeholder = _selectedTicketType === 'bug' ? 'Кратко опишите проблему' : 'Кратко опишите предложение';
          }
        });
      });
      display.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdownOptions(options);
      });
    }

    document.getElementById('tTitle').addEventListener('input', (e) => { _titleInput = e.target.value; });
    document.getElementById('tDesc').addEventListener('input', (e) => {
      _descInput = e.target.value;
      _charCount = e.target.value.length;
      document.getElementById('charCount').textContent = _charCount;
    });
    document.getElementById('sendTicketBtn').addEventListener('click', () => {
      if (_isSubmitting) return;
      if (_editingTicketId) updateTicket(_editingTicketId);
      else createTicket();
    });
  } else {
    container.innerHTML = `
      <div class="support-list-shell">
        <div class="support-filters">
          <input type="text" id="supportSearchInput" placeholder="Поиск..." value="${escapeHtml(_supportSearch)}">
          <select id="supportStatusFilter">
            <option value="">Все статусы</option>
            <option value="В обработке" ${_supportStatusFilter === 'В обработке' ? 'selected' : ''}>В обработке</option>
            <option value="Уточнение" ${_supportStatusFilter === 'Уточнение' ? 'selected' : ''}>Уточнение</option>
            <option value="Рассмотрено" ${_supportStatusFilter === 'Рассмотрено' ? 'selected' : ''}>Рассмотрено</option>
            <option value="Отклонено" ${_supportStatusFilter === 'Отклонено' ? 'selected' : ''}>Отклонено</option>
          </select>
          <select id="supportTypeFilter">
            <option value="">Все типы</option>
            <option value="bug" ${_supportTypeFilter === 'bug' ? 'selected' : ''}>Баг</option>
            <option value="idea" ${_supportTypeFilter === 'idea' ? 'selected' : ''}>Предложение</option>
          </select>
        </div>
        <div id="ticketsList" class="support-ticket-list"><div class="hint">Загрузка...</div></div>
        <div id="loadMoreContainer" class="support-load-more"></div>
      </div>
    `;

    document.getElementById('supportSearchInput').addEventListener('input', debounce(e => {
      _supportSearch = e.target.value;
      _ticketsLimit = 20;
      startSupportListeners();
    }, 300));

    document.getElementById('supportStatusFilter').addEventListener('change', e => {
      _supportStatusFilter = e.target.value;
      _ticketsLimit = 20;
      startSupportListeners();
    });

    document.getElementById('supportTypeFilter').addEventListener('change', e => {
      _supportTypeFilter = e.target.value;
      _ticketsLimit = 20;
      startSupportListeners();
    });

    if (_tickets.length) renderTicketsList();
  }
  updateSupportTabs();
}

function startSupportListeners(){
  if (_supportUnsub) _supportUnsub();
  let baseQuery;
  if (isSiteAdmin()) {
    baseQuery = db.collection('supportTickets').where('deleted', '==', false);
    if (_supportTab === 'history') baseQuery = baseQuery.where('archived', '==', false);
    else if (_supportTab === 'archive') baseQuery = baseQuery.where('archived', '==', true);
  } else {
    baseQuery = db.collection('supportTickets')
      .where('authorId', '==', state.user.uid)
      .where('deleted', '==', false);
  }

  if (_supportStatusFilter) {
    baseQuery = baseQuery.where('status', '==', _supportStatusFilter);
  }
  if (_supportTypeFilter) {
    baseQuery = baseQuery.where('type', '==', _supportTypeFilter);
  }

  const query = baseQuery.limit(_ticketsLimit);

  _supportUnsub = query.onSnapshot(snap => {
    const tickets = [];
    const migrationUpdates = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data.comments && data.comments.length) {
        const normalizedComments = data.comments.map(c => {
          if (!c.id) {
            const newId = randomId();
            return { ...c, id: newId };
          }
          return c;
        });
        if (JSON.stringify(normalizedComments) !== JSON.stringify(data.comments)) {
          migrationUpdates.push(db.collection('supportTickets').doc(doc.id).update({ comments: normalizedComments }));
        }
        data.comments = normalizedComments;
      }
      tickets.push({ id: doc.id, ...data });
    });
    if (migrationUpdates.length) Promise.all(migrationUpdates).catch(()=>{});

    let filteredTickets = tickets;
    if (_supportSearch) {
      const searchLower = _supportSearch.toLowerCase();
      filteredTickets = filteredTickets.filter(t =>
        (t.title || '').toLowerCase().includes(searchLower) ||
        (t.description || '').toLowerCase().includes(searchLower) ||
        (t.authorNickname || '').toLowerCase().includes(searchLower) ||
        (t.authorEmail || '').toLowerCase().includes(searchLower) ||
        (t.status || '').toLowerCase().includes(searchLower)
      );
    }

    _tickets = filteredTickets;
    _tickets.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    _hasMoreTickets = snap.docs.length === _ticketsLimit;
    renderTicketsList();

    if (_supportTab === 'history' && !isSiteAdmin()) {
      markTicketsAsRead();
    }

    if (isSiteAdmin() && _supportTab === 'history') markAdminTicketsAsRead();
  }, err => {
    console.error('Подписка на поддержку', err);
    const container = document.getElementById('ticketsList');
    if (container) container.innerHTML = errorState('Не удалось загрузить заявки. ' + humanError(err));
  });
}

function stopSupportListeners(){
  if (_supportUnsub) {
    _supportUnsub();
    _supportUnsub = null;
  }
}

function renderTicketsList(){
  const container = document.getElementById('ticketsList');
  if (!container) return;
  if (!_tickets.length) {
    container.innerHTML = emptyState('Заявок нет.');
    const loadMore = document.getElementById('loadMoreContainer');
    if (loadMore) loadMore.innerHTML = '';
    return;
  }
  const isAdmin = isSiteAdmin();
  container.innerHTML = _tickets.map(ticket => {
    const statusClass = ticketStatusClass(ticket.status);
    const unreadClass = (!isAdmin && ticket.userUnread) ? ' ticket-unread' : '';
    const unreadDot = (!isAdmin && ticket.userUnread) ? '<span class="unread-dot"></span>' : '';
    return `
      <div class="ticket-item${unreadClass}" data-id="${escapeHtml(ticket.id)}">
        <div class="ticket-header">
          ${unreadDot}
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
          ${(ticket.comments || []).map(c => `
            <div class="ticket-message ${c.authorId === state.user.uid ? 'own' : 'admin'}">
              <div class="msg-author">${escapeHtml(c.authorName)} ${c.authorRole ? `<span class="hint">(${escapeHtml(c.authorRole)})</span>` : ''}</div>
              <div class="msg-text">${escapeHtml(c.text)}</div>
              <div class="msg-date mono">${fmtDateTime(c.createdAt)}</div>
              ${isAdmin && c.authorId === state.user.uid ? `
                <div class="comment-actions">
                  <button class="btn btn-ghost btn-sm" data-action="comment-edit" data-id="${escapeHtml(ticket.id)}" data-comment-id="${escapeHtml(c.id)}">Редактировать</button>
                  <button class="btn btn-ghost btn-sm danger-text" data-action="comment-delete" data-id="${escapeHtml(ticket.id)}" data-comment-id="${escapeHtml(c.id)}">Удалить</button>
                </div>
              ` : ''}
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
            ${ticket.archived
              ? `<button class="btn btn-ghost btn-sm" data-action="support-unarchive" data-id="${escapeHtml(ticket.id)}">Вернуть из архива</button>`
              : `<button class="btn btn-ghost btn-sm" data-action="support-archive" data-id="${escapeHtml(ticket.id)}">В архив</button>`}
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  const loadMoreContainer = document.getElementById('loadMoreContainer');
  if (loadMoreContainer) {
    loadMoreContainer.innerHTML = _hasMoreTickets ? `<button class="btn btn-block" id="loadMoreTicketsBtn">Загрузить ещё</button>` : '';
    const loadMoreBtn = document.getElementById('loadMoreTicketsBtn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        _ticketsLimit += 20;
        startSupportListeners();
      });
    }
  }

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const ticketId = btn.dataset.id;
      const commentId = btn.dataset.commentId;
      handleSupportAction(action, ticketId, commentId);
    });
  });
}

function handleSupportAction(action, ticketId, commentId = null){
  const ticket = _tickets.find(t => t.id === ticketId);
  if (!ticket) return;
  switch(action){
    case 'support-edit': startEditTicket(ticket); break;
    case 'support-cancel': cancelTicket(ticketId); break;
    case 'support-reply': openReplyModal(ticket, false); break;
    case 'support-respond': openReplyModal(ticket, true); break;
    case 'comment-edit': openEditCommentModal(ticket, commentId); break;
    case 'comment-delete': deleteComment(ticket, commentId); break;
    case 'support-archive': archiveTicket(ticketId); break;
    case 'support-unarchive': unarchiveTicket(ticketId); break;
  }
}

async function createTicket(){
  if (_isSubmitting) return;
  const title = document.getElementById('tTitle').value.trim();
  const description = document.getElementById('tDesc').value.trim();
  if (title.length < 5 || description.length < 5) {
    toast('Минимальная длина заголовка и описания — 5 символов', 'error');
    return;
  }
  _isSubmitting = true;
  try {
    await db.collection('supportTickets').add({
      type: _selectedTicketType,
      title,
      description,
      status: 'В обработке',
      comments: [],
      userUnread: false,
      adminUnread: true,
      archived: false,
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
  } finally {
    _isSubmitting = false;
  }
}

async function updateTicket(ticketId){
  if (_isSubmitting) return;
  const title = document.getElementById('tTitle').value.trim();
  const description = document.getElementById('tDesc').value.trim();
  if (title.length < 5 || description.length < 5) {
    toast('Минимальная длина заголовка и описания — 5 символов', 'error');
    return;
  }
  _isSubmitting = true;
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
  } finally {
    _isSubmitting = false;
  }
}

async function cancelTicket(ticketId){
  const ok = await confirmDialog({
    title: 'Отменить заявку?',
    text: 'Она будет удалена и не попадёт на рассмотрение. Действие необратимо.',
    okText: 'Отменить',
    danger: true
  });
  if (!ok) return;
  try {
    await db.collection('supportTickets').doc(ticketId).update({
      deleted: true,
      updatedAt: FieldValue.serverTimestamp()
    });
    toast('Заявка отменена');
  } catch (err) {
    failToast(err, 'Не удалось отменить заявку');
  }
}

function openReplyModal(ticket, isAdmin){
  _replyText = '';
  const html = `
    <h2>${isAdmin ? 'Ответить как администратор' : 'Ответить'}</h2>
    <p class="sub">${escapeHtml(ticket.title)}</p>
    <div class="field">
      <label for="replyText">Сообщение</label>
      <textarea id="replyText" rows="6" maxlength="4000">${escapeHtml(_replyText)}</textarea>
      <div class="char-count"><span id="replyCount">0</span>/4000</div>
    </div>
    ${isAdmin ? `
      <div class="field">
        <label>Статус</label>
        <div class="custom-dropdown" id="statusDropdown">
          <div class="dropdown-display">${ticket.status}</div>
          <div class="dropdown-options">
            ${['В обработке','Уточнение','Рассмотрено','Отклонено'].map(s => `<div class="dropdown-option${ticket.status === s ? ' selected' : ''}" data-value="${s}">${s}</div>`).join('')}
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
  modal.classList.add('modal-wide');

  document.getElementById('replyText').addEventListener('input', (e) => {
    _replyText = e.target.value;
    document.getElementById('replyCount').textContent = e.target.value.length;
  });

  let selectedStatus = ticket.status;
  if (isAdmin) {
    const statusDropdown = document.getElementById('statusDropdown');
    if (statusDropdown) {
      const display = statusDropdown.querySelector('.dropdown-display');
      const options = statusDropdown.querySelector('.dropdown-options');
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
        toggleDropdownOptions(options);
        if (options.classList.contains('open')) {
          const rect = display.getBoundingClientRect();
          options.style.position = 'fixed';
          options.style.left = rect.left + 'px';
          options.style.top = rect.bottom + 'px';
          options.style.width = rect.width + 'px';
          options.style.maxHeight = '200px';
          options.style.zIndex = '1000';
        }
      });
    }
  }
  document.getElementById('sendReplyBtn').addEventListener('click', () => {
    if (_isSubmitting) return;
    sendReply(ticket, _replyText, isAdmin, selectedStatus);
  });
}

async function sendReply(ticket, text, isAdmin, newStatus){
  if (_isSubmitting) return;
  if (text.trim().length < 5) {
    toast('Минимальная длина сообщения — 5 символов', 'error');
    return;
  }
  _isSubmitting = true;
  const comment = {
    id: randomId(),
    authorId: state.user.uid,
    authorName: state.user.displayName || state.user.email,
    authorRole: isAdmin ? roleLabel(state.user) : '',
    text: text.trim(),
    createdAt: firebase.firestore.Timestamp.now()
  };
  try {
    const ticketRef = db.collection('supportTickets').doc(ticket.id);
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ticketRef);
      if (!doc.exists) throw new Error('Заявка не найдена');
      const data = doc.data();
      const comments = data.comments || [];
      comments.push(comment);
      const archived = (newStatus === 'Рассмотрено' || newStatus === 'Отклонено');
      transaction.update(ticketRef, {
        comments,
        status: isAdmin ? newStatus : 'Уточнение',
        archived: isAdmin ? archived : data.archived || false,
        updatedAt: FieldValue.serverTimestamp(),
        userUnread: isAdmin ? true : false,
        adminUnread: isAdmin ? false : true
      });
    });
    toast('Ответ отправлен');
    closeModal();
  } catch (err) {
    failToast(err, 'Не удалось отправить ответ');
  } finally {
    _isSubmitting = false;
  }
}

function openEditCommentModal(ticket, commentId){
  const comment = (ticket.comments || []).find(c => c.id === commentId);
  if (!comment) return;
  _editCommentStatus = ticket.status;
  const isAdmin = isSiteAdmin();
  const html = `
    <h2>Редактировать ответ</h2>
    <p class="sub">${escapeHtml(ticket.title)}</p>
    <div class="field">
      <textarea id="editCommentText" rows="6" maxlength="4000">${escapeHtml(comment.text)}</textarea>
      <div class="char-count"><span id="editCommentCount">${comment.text.length}</span>/4000</div>
    </div>
    ${isAdmin ? `
      <div class="field">
        <label>Статус</label>
        <div class="custom-dropdown" id="editStatusDropdown">
          <div class="dropdown-display">${ticket.status}</div>
          <div class="dropdown-options">
            ${['В обработке','Уточнение','Рассмотрено','Отклонено'].map(s => `<div class="dropdown-option${ticket.status === s ? ' selected' : ''}" data-value="${s}">${s}</div>`).join('')}
          </div>
        </div>
      </div>
    ` : ''}
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="modal-close">Отмена</button>
      <button class="btn btn-primary" id="saveEditCommentBtn">Сохранить</button>
    </div>`;
  const modal = openModal(html);
  modal.classList.add('support-modal');
  modal.classList.add('modal-wide');
  document.getElementById('editCommentText').addEventListener('input', (e) => {
    document.getElementById('editCommentCount').textContent = e.target.value.length;
  });
  if (isAdmin) {
    const statusDropdown = document.getElementById('editStatusDropdown');
    if (statusDropdown) {
      const display = statusDropdown.querySelector('.dropdown-display');
      const options = statusDropdown.querySelector('.dropdown-options');
      options.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          _editCommentStatus = opt.dataset.value;
          options.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          display.textContent = opt.textContent;
          options.classList.remove('open');
        });
      });
      display.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdownOptions(options);
        if (options.classList.contains('open')) {
          const rect = display.getBoundingClientRect();
          options.style.position = 'fixed';
          options.style.left = rect.left + 'px';
          options.style.top = rect.bottom + 'px';
          options.style.width = rect.width + 'px';
          options.style.maxHeight = '200px';
          options.style.zIndex = '1000';
        }
      });
    }
  }
  document.getElementById('saveEditCommentBtn').addEventListener('click', () => {
    if (_isSubmitting) return;
    updateCommentAndStatus(ticket.id, commentId);
  });
}

async function updateCommentAndStatus(ticketId, commentId){
  const text = document.getElementById('editCommentText').value.trim();
  if (text.length < 5) {
    toast('Минимальная длина сообщения — 5 символов', 'error');
    return;
  }
  _isSubmitting = true;
  try {
    const ticketRef = db.collection('supportTickets').doc(ticketId);
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ticketRef);
      if (!doc.exists) throw new Error('Заявка не найдена');
      const data = doc.data();
      const comments = data.comments || [];
      const comment = comments.find(c => c.id === commentId);
      if (!comment) throw new Error('Комментарий не найден');
      comment.text = text;
      const archived = (_editCommentStatus === 'Рассмотрено' || _editCommentStatus === 'Отклонено');
      transaction.update(ticketRef, {
        comments,
        status: _editCommentStatus,
        archived,
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    toast('Комментарий и статус обновлены');
    closeModal();
  } catch (err) {
    failToast(err, 'Не удалось обновить комментарий');
  } finally {
    _isSubmitting = false;
  }
}

function deleteComment(ticket, commentId){
  confirmDialog({
    title: 'Удалить комментарий?',
    text: 'Действие необратимо.',
    okText: 'Удалить',
    danger: true
  }).then(ok => {
    if (!ok) return;
    const ticketRef = db.collection('supportTickets').doc(ticket.id);
    db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ticketRef);
      if (!doc.exists) throw new Error('Заявка не найдена');
      const data = doc.data();
      const comments = data.comments || [];
      const newComments = comments.filter(c => c.id !== commentId);
      transaction.update(ticketRef, { comments: newComments, updatedAt: FieldValue.serverTimestamp() });
    }).then(() => {
      toast('Комментарий удалён');
    }).catch(err => failToast(err, 'Не удалось удалить комментарий'));
  });
}

function supportUnreadLabel(count) {
  const n = Math.max(0, Number(count) || 0);
  return n >= 10 ? '9+' : String(n);
}

function renderUnreadBadge(){
  const count = Math.max(0, Number(_unreadCount) || 0);
  const label = supportUnreadLabel(count);
  const badgeTop = document.getElementById('supportUnreadBadge');
  const badgeTab = document.getElementById('supportHistoryBadge');
  [badgeTop, badgeTab].forEach(badge => {
    if (!badge) return;
    badge.textContent = label;
    badge.hidden = count === 0;
    badge.setAttribute('aria-label', count ? `${count} непрочитанных заявок` : 'Нет непрочитанных заявок');
  });
}

function updateUnreadBadge(){
  // Значение обновляет initGlobalSupportUnreadListener через Firestore onSnapshot.
  // Здесь только синхронизируем уже известный realtime-счётчик с текущим DOM.
  renderUnreadBadge();
}

function markAdminTicketsAsRead(){
  if (!isSignedIn() || !isSiteAdmin()) return;
  _tickets.forEach(t => {
    if (t.adminUnread === true || (t.adminUnread == null && t.status === 'В обработке')) {
      db.collection('supportTickets').doc(t.id).update({ adminUnread: false }).catch(()=>{});
    }
  });
}

function markTicketsAsRead(){
  if (!isSignedIn() || isSiteAdmin()) return;
  _tickets.forEach(t => {
    if (t.userUnread === true) {
      db.collection('supportTickets').doc(t.id).update({ userUnread: false }).catch(()=>{});
    }
  });
}

function ticketStatusClass(status){
  switch(status){
    case 'Рассмотрено': return 'badge-green';
    case 'Отклонено': return 'badge-red';
    case 'Уточнение': return 'badge-yellow';
    default: return 'badge-grey';
  }
}

async function archiveTicket(ticketId){
  if (_isSubmitting) return;
  _isSubmitting = true;
  try {
    await db.collection('supportTickets').doc(ticketId).update({ archived: true, updatedAt: FieldValue.serverTimestamp() });
    toast('Тикет перемещён в архив');
  } catch (err) {
    failToast(err, 'Не удалось архивировать');
  } finally {
    _isSubmitting = false;
  }
}

async function unarchiveTicket(ticketId){
  if (_isSubmitting) return;
  _isSubmitting = true;
  try {
    await db.collection('supportTickets').doc(ticketId).update({ archived: false, updatedAt: FieldValue.serverTimestamp() });
    toast('Тикет возвращён из архива');
  } catch (err) {
    failToast(err, 'Не удалось вернуть из архива');
  } finally {
    _isSubmitting = false;
  }
}
