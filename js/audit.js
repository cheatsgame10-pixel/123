function auditEntry({ action, objectType, objectId, oldValue = null, newValue = null, additionalInfo = '', faction = null }){
  const u = state.user;
  return {
    timestamp: FieldValue.serverTimestamp(),
    userId: u.uid,
    email: u.email,
    nickname: u.displayName || '',
    systemRole: u.systemRole,
    serverLevel: u.serverLevel,
    faction: faction,
    action,
    objectType,
    objectId: objectId || null,
    oldValue,
    newValue,
    additionalInfo
  };
}

function addAudit(batch, params){
  const ref = db.collection('auditLog').doc();
  batch.set(ref, auditEntry(params));
  return ref;
}

function addVersion(batch, objectType, objectId, data){
  const ref = db.collection('dataVersions').doc();
  batch.set(ref, newVersionPayload(objectType, objectId, data, state.user));
  return ref;
}

function stripSystem(data){
  const out = { ...data };
  delete out.updatedAt;
  return out;
}
