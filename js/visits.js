let _visitStarted = 0;

async function startVisit(){
  if (state.visitId) return;
  state.sessionId = randomId();
  _visitStarted = Date.now();
  const ref = db.collection('visits').doc();
  const u = state.user;
  try {
    await ref.set({
      sessionId: state.sessionId,
      timestamp: FieldValue.serverTimestamp(),
      entryAt: FieldValue.serverTimestamp(),
      uid: u ? u.uid : null,
      email: u ? u.email : null,
      role: u ? u.systemRole : 'guest',
      isGuest: !u,
      page: state.tab || 'leaders',
      lastPage: state.tab || 'leaders',
      exitAt: null,
      duration: null
    });
    state.visitId = ref.id;
  } catch (err){
    console.error('Посещение', err);
  }
}

function visitPage(tab){
  if (!state.visitId) return;
  db.collection('visits').doc(state.visitId).update({ lastPage: tab }).catch(err => console.error('Посещение', err));
}

function endVisit(){
  if (!state.visitId) return;
  const duration = Math.round((Date.now() - _visitStarted) / 1000);
  db.collection('visits').doc(state.visitId).update({ exitAt: FieldValue.serverTimestamp(), duration }).catch(() => {});
}

function bindVisitLifecycle(){
  window.addEventListener('pagehide', endVisit);
}
