let _presenceTimer = null;
let _lastActivity = Date.now();
let _presenceBound = false;

function presenceRef(){
  return db.collection('presence').doc(state.authUser.uid);
}

async function presenceWrite(stateName){
  if (!state.authUser) return;
  try {
    await presenceRef().set({
      uid: state.authUser.uid,
      state: stateName,
      lastSeen: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err){
    console.error('Presence', err);
  }
}

function presenceTick(){
  if (!state.authUser) return;
  if (document.visibilityState === 'hidden') return;
  if (Date.now() - _lastActivity > PRESENCE_IDLE_MS) return;
  presenceWrite('online');
}

function startPresence(){
  stopPresence();
  _lastActivity = Date.now();
  presenceWrite('online');
  _presenceTimer = setInterval(presenceTick, PRESENCE_HEARTBEAT_MS);
  if (_presenceBound) return;
  _presenceBound = true;
  const bump = () => { _lastActivity = Date.now(); };
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev =>
    document.addEventListener(ev, bump, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!state.authUser) return;
    if (document.visibilityState === 'visible'){ _lastActivity = Date.now(); presenceWrite('online'); }
    else presenceWrite('away');
  });
  window.addEventListener('pagehide', () => { if (state.authUser) presenceWrite('offline'); });
  window.addEventListener('online', () => { if (state.authUser) presenceWrite('online'); });
}

function stopPresence(){
  if (_presenceTimer){ clearInterval(_presenceTimer); _presenceTimer = null; }
}

async function stopPresenceAndSignalOffline(){
  stopPresence();
  await presenceWrite('offline');
}

function isOnline(p){
  if (!p || p.state !== 'online') return false;
  const d = toDate(p.lastSeen);
  return !!d && (Date.now() - d.getTime()) < PRESENCE_ONLINE_WINDOW_MS;
}

async function loadPresenceMap(uids){
  const out = {};
  if (!isSignedIn() || !uids.length) return out;
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
  try {
    for (const chunk of chunks){
      const snap = await db.collection('presence').where('uid', 'in', chunk).get();
      snap.forEach(d => { out[d.id] = d.data(); });
    }
  } catch (err){
    console.error('Presence map', err);
  }
  return out;
}

function presenceBadge(p){
  return isOnline(p)
    ? '<span class="online-badge on">● В сети</span>'
    : '<span class="online-badge">Не в сети</span>';
}
