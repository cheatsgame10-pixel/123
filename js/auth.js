let _userUnsub = null;
let _pendingUserData = null;
const DISCORD_OAUTH_PROFILE_KEY = 'gta5rp.discordOAuthProfile';
let _loginInProgress = false;

async function readUserProfileWithRetry(uid, attempts = 6, delayMs = 250) {
  let snap = null;
  for (let i = 0; i < attempts; i++) {
    snap = await db.collection('users').doc(uid).get();
    if (snap.exists) return snap;
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return snap;
}

function rememberDiscordProfile(data) {
  _pendingUserData = data || null;
  try {
    if (data) sessionStorage.setItem(DISCORD_OAUTH_PROFILE_KEY, JSON.stringify(data));
    else sessionStorage.removeItem(DISCORD_OAUTH_PROFILE_KEY);
  } catch (_) {}
}

function readRememberedDiscordProfile() {
  if (_pendingUserData) return _pendingUserData;
  try {
    const raw = sessionStorage.getItem(DISCORD_OAUTH_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearRememberedDiscordProfile() {
  _pendingUserData = null;
  try { sessionStorage.removeItem(DISCORD_OAUTH_PROFILE_KEY); } catch (_) {}
}


async function resetFailedDiscordLogin(message = '') {
  clearRememberedDiscordProfile();
  try {
    // Старые версии проекта могли оставлять служебное состояние OAuth в sessionStorage.
    Object.keys(sessionStorage).filter(key => /discord.*oauth|oauth.*discord/i.test(key)).forEach(key => {
      if (key !== DISCORD_OAUTH_PROFILE_KEY) sessionStorage.removeItem(key);
    });
  } catch (_) {}
  _loginInProgress = false;
  setGuestLoginLoading(false, message || 'Можно повторить вход через Discord.');
  if (auth.currentUser) {
    try { await auth.signOut(); } catch (_) {}
  }
}

function initAuth() {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  auth.getRedirectResult().catch(err => {
    if (err && err.code !== 'auth/no-auth-event') {
      const message = `Не удалось завершить вход: ${humanError(err)}`;
      failToast(err, 'Не удалось войти');
      resetFailedDiscordLogin(message);
    }
  });
  auth.onAuthStateChanged(async user => {
    if (_userUnsub) { _userUnsub(); _userUnsub = null; }
    if (!user) {
      state.authUser = null;
      state.user = null;
      stopPresence();
      onSessionChanged(true);
      return;
    }
    state.authUser = user;
    try {
      const snap = await readUserProfileWithRetry(user.uid);
      if (!snap.exists) {
        clearRememberedDiscordProfile();
        await auth.signOut();
        const message = 'Discord-вход выполнен, но профиль пользователя не был создан в Firestore. Обратитесь к администратору сайта.';
        toast(message, 'error');
        setGuestLoginLoading(false, message);
        _loginInProgress = false;
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      const data = snap.data();
      if (data.deleted === true) {
        clearRememberedDiscordProfile();
        if (typeof stopAuthenticatedRealtimeListeners === 'function') stopAuthenticatedRealtimeListeners();
        await auth.signOut();
        const message = 'Ваш аккаунт удалён администратором сайта.';
        toast(message, 'error');
        setGuestLoginLoading(false, message);
        _loginInProgress = false;
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      if (data.disabledByAdmin === true) {
        clearRememberedDiscordProfile();
        if (typeof stopAuthenticatedRealtimeListeners === 'function') stopAuthenticatedRealtimeListeners();
        await auth.signOut();
        const message = 'Ваш аккаунт отключён администратором сайта.';
        toast(message, 'error');
        setGuestLoginLoading(false, message);
        _loginInProgress = false;
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      if (data.active === false) {
        clearRememberedDiscordProfile();
        if (typeof stopAuthenticatedRealtimeListeners === 'function') stopAuthenticatedRealtimeListeners();
        await auth.signOut();
        const message = data.discordAccessDisabled
          ? 'Discord не подтвердил ваше участие ни на одном разрешённом сервере проекта. Повторите вход через Discord.'
          : 'Ваш аккаунт сейчас неактивен. Обратитесь к администратору сайта.';
        toast(message, 'error');
        setGuestLoginLoading(false, message);
        _loginInProgress = false;
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      if (data.systemRole === 'user') {
        clearRememberedDiscordProfile();
        await auth.signOut();
        const message = 'Ваш аккаунт использует устаревшую системную роль. Обратитесь к администратору сайта.';
        toast(message, 'error');
        setGuestLoginLoading(false, message);
        _loginInProgress = false;
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      // Сервер синхронизации Discord удаляет устаревшую pending-заявку сам.
      clearRememberedDiscordProfile();
      state.user = normalizeUser(user.uid, data);
      if (_loginInProgress) {
        _loginInProgress = false;
        setGuestLoginLoading(false, 'Вход выполнен.');
        toast('Вы вошли через Discord!');
      }
      _userUnsub = db.collection('users').doc(user.uid).onSnapshot(snap2 => {
        if (!snap2.exists) {
          state.user = null;
          onSessionChanged();
          return;
        }
        const newData = normalizeUser(user.uid, snap2.data());
        if (newData.active === false || newData.deleted === true) {
          state.user = null;
          const message = newData.deleted === true
            ? 'Ваш аккаунт удалён администратором сайта.'
            : (newData.discordAccessDisabled ? 'Discord больше не подтверждает участие на разрешённых серверах проекта.' : 'Ваш аккаунт отключён администратором сайта.');
          toast(message, 'error');
          clearRememberedDiscordProfile();
          _loginInProgress = false;
          setGuestLoginLoading(false, message);
          auth.signOut();
          return;
        }
        const prevRole = state.user ? state.user.systemRole : null;
        state.user = newData;
        const roleChanged = prevRole !== null && prevRole !== state.user.systemRole;
        onSessionChanged(roleChanged);
        if (roleChanged) toast('Ваши права были изменены администрацией');
      }, err => {
        failToast(err, 'Не удалось получить данные профиля');
        auth.signOut();
      });
      onSessionChanged(true);
    } catch (err) {
      failToast(err, 'Не удалось проверить профиль');
      clearRememberedDiscordProfile();
      _loginInProgress = false;
      setGuestLoginLoading(false, `Не удалось проверить профиль: ${humanError(err)}`);
      await auth.signOut();
      state.authUser = null;
      state.user = null;
      onSessionChanged(true);
    }
  });
}

function normalizeUser(uid, d) {
  return {
    uid,
    email: d.email || '',
    displayName: typeof d.displayName === 'string' ? cleanDiscordGuildNickname(d.displayName) : '',
    avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : '',
    discordUsername: typeof d.discordUsername === 'string' ? d.discordUsername : '',
    discordDisplayName: typeof d.discordDisplayName === 'string' ? cleanDiscordGuildNickname(d.discordDisplayName) : '',
    discordGuildNickname: typeof d.discordGuildNickname === 'string' ? cleanDiscordGuildNickname(d.discordGuildNickname) : '',
    discordGuildId: typeof d.discordGuildId === 'string' ? d.discordGuildId : '',
    serverLevel: Number.isInteger(d.serverLevel) ? d.serverLevel : 2,
    systemRole: ROLES[d.systemRole] ? d.systemRole : null,
    faction: typeof d.faction === 'string' && d.faction ? d.faction : null,
    direction: typeof d.direction === 'string' && d.direction ? d.direction : null,
    curatedFactions: Array.isArray(d.curatedFactions) ? d.curatedFactions.filter(x => typeof x === 'string') : [],
    permissions: Array.isArray(d.permissions) ? d.permissions.filter(x => typeof x === 'string') : [],
    active: d.active !== false,
    disabledByAdmin: d.disabledByAdmin === true,
    discordAccessDisabled: d.discordAccessDisabled === true,
    discordAccessDisabledReason: typeof d.discordAccessDisabledReason === 'string' ? d.discordAccessDisabledReason : '',
    deleted: d.deleted === true,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null
  };
}


function setGuestLoginLoading(loading, note = '') {
  const btn = document.getElementById('guestLoginBtn');
  if (btn) {
    btn.disabled = !!loading;
    btn.classList.toggle('loading', !!loading);
    const text = btn.querySelector('.guest-login-text');
    if (text) text.textContent = loading ? 'Выполняем вход' : 'Войти через Discord';
  }
  const noteEl = document.getElementById('guestLoginNote');
  if (noteEl && note) noteEl.textContent = note;
}

async function login() {
  if (_loginInProgress) return;
  _loginInProgress = true;
  setGuestLoginLoading(true, 'Открываем Discord и проверяем доступ…');
  const width = 500, height = 700;
  const left = (window.innerWidth - width) / 2;
  const top = (window.innerHeight - height) / 2;
  const popup = window.open(
    'https://us-central1-gta5rp-hub.cloudfunctions.net/api/login',
    'Discord Login',
    `width=${width},height=${height},left=${left},top=${top}`
  );
  if (!popup) {
    _loginInProgress = false;
    setGuestLoginLoading(false, 'Разрешите всплывающие окна для входа через Discord.');
    const err = new Error('Popup blocked'); err.code = 'auth/popup-blocked'; throw err;
  }

  return new Promise((resolve, reject) => {
    let resolved = false;

    const handler = async (event) => {
      if (event.origin !== 'https://us-central1-gta5rp-hub.cloudfunctions.net') return;
      if (event.source !== popup) return;
      if (event.data && event.data.type === 'DISCORD_AUTH_ERROR') {
        const message = event.data.message || 'Вход запрещён. Discord не подтвердил доступ к серверу проекта.';
        toast(message, 'error');
        resolved = true;
        clearInterval(checkPopupClosed);
        window.removeEventListener('message', handler);
        if (popup && !popup.closed) popup.close();
        await resetFailedDiscordLogin(message);
        const err = new Error(message); err.code = event.data.code || 'permission-denied';
        reject(err);
        return;
      }
      if (event.data && event.data.type === 'FIREBASE_TOKEN') {
        try {
          const { token, displayName, discordUsername, discordGuildNickname, avatarUrl, email } = event.data;
          rememberDiscordProfile({ displayName, discordUsername, discordGuildNickname, email, avatarUrl });
          setGuestLoginLoading(true, 'Discord подтверждён. Загружаем ваш профиль…');

          const userCredential = await auth.signInWithCustomToken(token);
          const user = userCredential.user;

          if (displayName || avatarUrl) {
            await user.updateProfile({
              displayName: displayName || user.displayName,
              photoURL: avatarUrl || user.photoURL
            });
          }

          resolved = true;
          clearInterval(checkPopupClosed);
          window.removeEventListener('message', handler);
          if (popup && !popup.closed) popup.close();
          resolve();
        } catch (err) {
          console.error('Ошибка входа через Discord:', err);
          toast('Не удалось войти через Discord', 'error');
          resolved = true;
          clearInterval(checkPopupClosed);
          window.removeEventListener('message', handler);
          if (popup && !popup.closed) popup.close();
          await resetFailedDiscordLogin(`Не удалось войти через Discord: ${humanError(err)}`);
          reject(err);
        }
      }
    };

    window.addEventListener('message', handler);

    const checkPopupClosed = setInterval(async () => {
      if (popup.closed && !resolved) {
        resolved = true;
        clearInterval(checkPopupClosed);
        window.removeEventListener('message', handler);
        await resetFailedDiscordLogin('Вход отменён: окно Discord было закрыто до завершения авторизации. Можно попробовать снова.');
        reject(new Error('Popup closed by user'));
      }
    }, 500);
  });
}

async function confirmLogout() {
  const ok = await confirmDialog({
    title: 'Выйти из аккаунта?',
    text: 'Текущая сессия завершится — для входа снова потребуется авторизация через Discord.',
    okText: 'Выйти',
    danger: true
  });
  if (ok) await logout();
}

async function logout() {
  try {
    if (typeof stopGlobalSupportUnreadListener === 'function') stopGlobalSupportUnreadListener();
    await stopPresenceAndSignalOffline();
    await auth.signOut();
    toast('Вы вышли из аккаунта');
  } catch (err) {
    failToast(err, 'Не удалось выйти');
  }
}