function toast(msg, type){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', type === 'error');
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 3200);
}

function escapeHtml(v){
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function debounce(fn, ms){
  let h;
  return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
}

function pad2(n){ return String(n).padStart(2, '0'); }

function getMoscowNow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3 * 3600000));
}

function getMoscowDate() {
  const now = getMoscowNow();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function todayISO(){
  const d = getMoscowNow();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDate(v){
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(v){
  const d = toDate(v);
  return d ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

function fmtDateTime(v){
  const d = toDate(v);
  return d ? d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

function fmtISO(iso){
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function parseForumDate(str){
  if (!str) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str.trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function termDaysFor(forumKey){
  return forumKey === GOV_FORUM_KEY ? TERM_DAYS_GOV : TERM_DAYS;
}

function daysLeftInfo(appointedDateStr, termText, forumKey){
  const d = parseForumDate(appointedDateStr);
  if (!d) return { status: 'unknown', badgeClass: 'badge-grey', text: 'Дата уточняется', days: null };
  let termNumber = 1;
  if (termText){
    const m = termText.match(/(\d+)-й\s*срок/);
    if (m) termNumber = parseInt(m[1], 10);
  }
  const total = termNumber * termDaysFor(forumKey);
  const deadline = new Date(d.getTime() + (total + 1) * 86400000);
  const today = getMoscowDate();
  const deadlineDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const diffDays = Math.floor((deadlineDay - today) / 86400000);
  const half = termDaysFor(forumKey) / 2;
  if (diffDays < 0)     return { status: 'expired', badgeClass: 'badge-red',    text: 'Срок истёк', days: diffDays };
  if (diffDays === 0)   return { status: 'expired', badgeClass: 'badge-red',    text: 'Срок истёк', days: 0 };
  if (diffDays <= 5)    return { status: 'red',     badgeClass: 'badge-red',    text: 'Срок подходит к концу', days: diffDays };
  if (diffDays <= half) return { status: 'yellow',  badgeClass: 'badge-yellow', text: 'Прошла половина срока', days: diffDays };
  return                 { status: 'green',   badgeClass: 'badge-green',  text: 'Лидер недавно назначен', days: diffDays };
}

function daysText(days){
  if (days === null) return '—';
  if (days < 0) return `истёк ${Math.abs(days)} дн. назад`;
  if (days === 0) return 'истёк сегодня';
  return `осталось ${days} дн.`;
}

function pointsHtml(raw){
  const n = parseInt(String(raw ?? '').replace(/[^-\d]/g, ''), 10);
  if (isNaN(n)) return `<span class="pts pts-zero">${escapeHtml(raw ?? '—')}</span>`;
  if (n > 0) return `<span class="pts pts-pos">+${n}</span>`;
  if (n < 0) return `<span class="pts pts-neg">${n}</span>`;
  return '<span class="pts pts-zero">0</span>';
}

function warningsClass(warnStr){
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec((warnStr || '').trim());
  if (!m) return '';
  const n = parseInt(m[1], 10);
  if (n <= 0) return 'warn-ok';
  if (n === 1) return 'warn-mid';
  return 'warn-bad';
}

const STATUS_ORDER = { expired: 0, red: 1, yellow: 2, green: 3, vacant: 4, unknown: 5 };

const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
  р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
};

function slugify(str){
  return String(str || '').toLowerCase()
    .split('').map(ch => TRANSLIT[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'faction';
}

function initialsOf(name){
  const parts = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function avatarHtml(url, name, cls){
  const c = 'avatar' + (cls ? ' ' + cls : '');
  if (url) return `<img class="${c}" src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${c}',textContent:'${escapeHtml(initialsOf(name))}'}))">`;
  return `<div class="${c}">${escapeHtml(initialsOf(name))}</div>`;
}

const ERROR_MESSAGES = {
  'permission-denied': 'У вас недостаточно прав для выполнения этого действия.',
  'unauthenticated': 'Войдите в аккаунт, чтобы продолжить.',
  'failed-precondition': 'Операция не может быть выполнена. Обновите страницу и попробуйте ещё раз.',
  'not-found': 'Данные не найдены. Возможно, они были удалены.',
  'already-exists': 'Такая запись уже существует.',
  'resource-exhausted': 'Слишком много запросов. Попробуйте через минуту.',
  'unavailable': 'Сервер временно недоступен. Проверьте интернет и попробуйте ещё раз.',
  'deadline-exceeded': 'Сервер не ответил вовремя. Попробуйте ещё раз.',
  'cancelled': 'Операция была отменена.',
  'aborted': 'Данные изменились во время операции. Обновите страницу и попробуйте ещё раз.',
  'invalid-argument': 'Данные заполнены некорректно.',
  'auth/network-request-failed': 'Нет соединения с сетью. Проверьте интернет.',
  'auth/unauthorized-domain': 'Этот домен не разрешён для входа. Обратитесь к администратору сайта.',
  'auth/too-many-requests': 'Слишком много попыток входа. Подождите пару минут.',
  'auth/popup-blocked': 'Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта.',
  'auth/user-disabled': 'Этот аккаунт отключён.',
  'storage/unauthorized': 'Нельзя загрузить этот файл: недостаточно прав или файл не подходит.',
  'storage/canceled': 'Загрузка отменена.',
  'storage/quota-exceeded': 'Хранилище переполнено. Обратитесь к администратору сайта.',
  'storage/retry-limit-exceeded': 'Не удалось загрузить файл. Проверьте интернет и попробуйте ещё раз.',
  'storage/invalid-format': 'Файл имеет неподдерживаемый формат.',
  'network': 'Нет соединения с сервером. Проверьте интернет.',
  'timeout': 'Сервер не ответил вовремя. Попробуйте ещё раз.'
};

function humanError(err){
  const code = err && (err.code || err.message);
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (err && err.name === 'AbortError') return ERROR_MESSAGES.timeout;
  if (err && err instanceof TypeError) return ERROR_MESSAGES.network;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

function failToast(err, prefix){
  console.error(prefix || 'Ошибка', err);
  toast((prefix ? prefix + ': ' : '') + humanError(err), 'error');
}

let _confirmResolve = null;

function confirmDialog({ title = 'Подтверждение', text = '', okText = 'Удалить', danger = true, reason = false, typed = '' } = {}){
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  const ok = document.getElementById('confirmOk');
  ok.textContent = okText;
  ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
  const wrap = document.getElementById('confirmReasonWrap');
  wrap.hidden = !reason;
  document.getElementById('confirmReason').value = '';
  const typedWrap = document.getElementById('confirmTypedWrap');
  typedWrap.hidden = !typed;
  typedWrap.dataset.word = typed;
  document.getElementById('confirmTypedLabel').textContent = typed ? `Для подтверждения введите слово ${typed}` : '';
  document.getElementById('confirmTyped').value = '';
  document.getElementById('confirmOverlay').classList.add('open');
  if (reason) setTimeout(() => document.getElementById('confirmReason').focus(), 30);
  return new Promise(resolve => { _confirmResolve = resolve; });
}

function closeConfirm(result){
  const overlay = document.getElementById('confirmOverlay');
  if (!overlay.classList.contains('open')) return;
  const reasonWanted = !document.getElementById('confirmReasonWrap').hidden;
  const reason = document.getElementById('confirmReason').value.trim();
  if (result && reasonWanted && !reason){
    toast('Укажите причину', 'error');
    return;
  }
  const typedWrap = document.getElementById('confirmTypedWrap');
  if (result && !typedWrap.hidden && document.getElementById('confirmTyped').value.trim() !== typedWrap.dataset.word){
    toast(`Введите слово ${typedWrap.dataset.word}, чтобы подтвердить`, 'error');
    return;
  }
  overlay.classList.remove('open');
  if (_confirmResolve){
    _confirmResolve(result ? (reasonWanted ? { ok: true, reason } : true) : false);
    _confirmResolve = null;
  }
}

function openModal(html){
  const box = document.getElementById('modalBox');
  box.innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
  const first = box.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return box;
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalBox').innerHTML = '';
}

function setLoading(btn, on){
  if (!btn) return;
  btn.classList.toggle('loading', !!on);
  btn.disabled = !!on;
}

function skeletonCards(n, cls){
  return `<div class="skel-grid">${Array.from({ length: n }, () => `<div class="skel-card ${cls || ''}"></div>`).join('')}</div>`;
}

function skeletonRows(n){
  return Array.from({ length: n }, () => '<div class="skel-card skel-row"></div>').join('');
}

function emptyState(text, actionHtml){
  return `<div class="empty-state">${escapeHtml(text)}${actionHtml ? '<div>' + actionHtml + '</div>' : ''}</div>`;
}

function errorState(text, retryAction){
  return `<div class="empty-state error-state">${escapeHtml(text)}${retryAction ? `<div><button class="btn btn-primary" data-action="${retryAction}">Повторить</button></div>` : ''}</div>`;
}

function lockedState(text){
  return `<div class="empty-state locked-state">${escapeHtml(text)}<div><button class="btn btn-primary" data-action="login">Войти через Google</button></div></div>`;
}

function fetchWithTimeout(url, opts, ms){
  const ctrl = new AbortController();
  const h = setTimeout(() => ctrl.abort(), ms || API_TIMEOUT_MS);
  return fetch(url, { ...(opts || {}), signal: ctrl.signal }).finally(() => clearTimeout(h));
}

function sortByName(a, b){
  return String(a.name || a).localeCompare(String(b.name || b), 'ru');
}

function randomId(){
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
}

function newVersionPayload(objectType, objectId, data, actor){
  return {
    objectType,
    objectId,
    data,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid,
    createdByEmail: actor.email
  };
}
