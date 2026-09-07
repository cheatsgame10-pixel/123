let _userUnsub = null;

function initAuth(){
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  auth.getRedirectResult().catch(err => {
    if (err && err.code !== 'auth/no-auth-event') failToast(err, 'Не удалось войти');
  });
  auth.onAuthStateChanged(async user => {
    if (_userUnsub){ _userUnsub(); _userUnsub = null; }
    if (!user){
      state.authUser = null;
      state.user = null;
      stopPresence();
      onSessionChanged(true);
      return;
    }
    state.authUser = user;
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      if (!snap.exists) {
        await savePendingUser(user);
        await auth.signOut();
        toast('Ваш аккаунт не зарегистрирован в системе. Обратитесь к администратору сайта.', 'error');
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      const data = snap.data();
      if (data.active === false || data.deleted === true) {
        await auth.signOut();
        toast('Ваш аккаунт отключён или удалён администратором.', 'error');
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      if (data.systemRole === 'user') {
        await auth.signOut();
        toast('Ваш аккаунт использует устаревшую роль. Обратитесь к администратору.', 'error');
        state.authUser = null;
        state.user = null;
        onSessionChanged(true);
        return;
      }
      await removePendingUser(user.uid);
      state.user = normalizeUser(user.uid, data);
      _userUnsub = db.collection('users').doc(user.uid).onSnapshot(snap2 => {
        if (!snap2.exists) {
          state.user = null;
          onSessionChanged();
          return;
        }
        const newData = normalizeUser(user.uid, snap2.data());
        if (newData.active === false || newData.deleted === true) {
          state.user = null;
          toast('Ваш аккаунт отключён или удалён администратором', 'error');
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
      await auth.signOut();
      state.authUser = null;
      state.user = null;
      onSessionChanged(true);
    }
  });
}

function normalizeUser(uid, d){
  return {
    uid,
    email: d.email || '',
    displayName: typeof d.displayName === 'string' ? d.displayName : '',
    avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : '',
    serverLevel: Number.isInteger(d.serverLevel) ? d.serverLevel : 1,
    systemRole: ROLES[d.systemRole] ? d.systemRole : null,
    faction: typeof d.faction === 'string' && d.faction ? d.faction : null,
    direction: typeof d.direction === 'string' && d.direction ? d.direction : null,
    curatedFactions: Array.isArray(d.curatedFactions) ? d.curatedFactions.filter(x => typeof x === 'string') : [],
    permissions: Array.isArray(d.permissions) ? d.permissions.filter(x => typeof x === 'string') : [],
    reportEditingEnabled: d.reportEditingEnabled === true,
    active: d.active !== false,
    deleted: d.deleted === true,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null
  };
}

async function savePendingUser(user){
  try {
    await db.collection('pendingUsers').doc(user.uid).set({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      attemptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Не удалось сохранить pending пользователя', err);
  }
}

async function removePendingUser(uid){
  try {
    await db.collection('pendingUsers').doc(uid).delete();
  } catch (err) {
    console.error('Не удалось удалить pending пользователя', err);
  }
}

async function login(){
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await auth.signInWithPopup(provider);
  } catch (err){
    if (err.code === 'auth/popup-blocked'){ auth.signInWithRedirect(provider); return; }
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    failToast(err, 'Не удалось войти');
  }
}

async function logout(){
  try {
    await stopPresenceAndSignalOffline();
    await auth.signOut();
    toast('Вы вышли из аккаунта');
  } catch (err){
    failToast(err, 'Не удалось выйти');
  }
}
