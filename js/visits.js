let _visitStarted = 0;

async function startVisit() {
  if (state.visitId) return;
  state.sessionId = randomId();
  _visitStarted = Date.now();
  try {
    const result = await firebaseApiRequest('/visits/start', {
      sessionId: state.sessionId,
      page: state.tab || 'leaders'
    }, { authRequired: false });
    state.visitId = result.visitId || null;
  } catch (err) {
    console.warn('Посещение не записано:', err.code || err.message);
  }
}

function visitPage(tab) {
  if (!state.visitId || !state.sessionId) return;
  firebaseApiRequest('/visits/page', {
    visitId: state.visitId,
    sessionId: state.sessionId,
    page: tab
  }, { authRequired: false }).catch(() => {});
}

function endVisit() {
  if (!state.visitId || !state.sessionId) return;
  const duration = Math.round((Date.now() - _visitStarted) / 1000);
  firebaseApiRequest('/visits/end', {
    visitId: state.visitId,
    sessionId: state.sessionId,
    duration
  }, { authRequired: false }).catch(() => {});
}

function bindVisitLifecycle() {
  window.addEventListener('pagehide', endVisit);
}
