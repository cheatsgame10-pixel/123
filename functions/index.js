const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const express = require('express');
const crypto = require('crypto');

admin.initializeApp();

const firestore = admin.firestore();
const app = express();

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1546629539373781083';
// Секрет Discord не хранится в репозитории. Перед развёртыванием задайте DISCORD_CLIENT_SECRET.
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ||
  'https://us-central1-gta5rp-hub.cloudfunctions.net/api/auth';
const MAIN_GUILD_ID = process.env.DISCORD_MAIN_GUILD_ID || '1512978631448854629';
const SECONDARY_GUILD_ID = process.env.DISCORD_SECONDARY_GUILD_ID || '1512812941064409148';

const DEFAULT_DISCORD_FACTION_ROLES = Object.freeze({
  '1512978631461306378': {faction: 'ems', direction: 'state'},
  '1512978631461306383': {faction: 'fib', direction: 'state'},
  '1512978631461306384': {faction: 'gov', direction: 'state'},
  '1512978631461306382': {faction: 'lspd', direction: 'state'},
  '1512978631448854638': {faction: 'wn', direction: 'state'},
  '1512978631461306380': {faction: 'ng', direction: 'state'},
  '1512978631461306381': {faction: 'lssd', direction: 'state'},
  '1512978631461306379': {faction: 'fp', direction: 'state'},
  '1512978631477956702': {faction: 'rm', direction: 'mafia'},
  '1512978631477956701': {faction: 'lcn', direction: 'mafia'},
  '1512978631477956700': {faction: 'am', direction: 'mafia'},
  '1512978631477956699': {faction: 'mm', direction: 'mafia'},
  '1512978631477956698': {faction: 'yak', direction: 'mafia'},
  '1512978631461306386': {faction: 'lsv', direction: 'ghetto'},
  '1512978631461306385': {faction: 'mg-13', direction: 'ghetto'},
  '1512978631461306387': {faction: 'esb', direction: 'ghetto'},
});

function readFactionRoleOverrides(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    Object.entries(parsed).forEach(([roleId, meta]) => {
      const faction = String(meta?.faction || '').trim().toLowerCase();
      const direction = String(meta?.direction || '').trim().toLowerCase();
      if (!/^\d{10,30}$/.test(String(roleId)) || !/^[a-z0-9-]{1,40}$/.test(faction)) return;
      if (!['state', 'ghetto', 'mafia'].includes(direction)) return;
      out[String(roleId)] = {faction, direction};
    });
    return out;
  } catch (error) {
    console.warn('DISCORD_FACTION_ROLES_JSON is invalid JSON; overrides ignored:', error.message);
    return {};
  }
}

const DISCORD_FACTION_ROLES = Object.freeze({
  ...DEFAULT_DISCORD_FACTION_ROLES,
  ...readFactionRoleOverrides(process.env.DISCORD_FACTION_ROLES_JSON || ''),
});
const DISCORD_ASSISTANT_ROLES = new Set(['1512978631507574816', '1512978631507574817']);
const DISCORD_LEVEL_ROLES = Object.freeze({
  '1512978631507574821': 3,
  '1546838130298982460': 2,
});
const DISCORD_ACCESS_ROLES = new Set([
  ...Object.keys(DISCORD_FACTION_ROLES),
  ...DISCORD_ASSISTANT_ROLES,
  ...Object.keys(DISCORD_LEVEL_ROLES),
]);
const OAUTH_STATE_COOKIE = 'discord_oauth_state';

function getDiscordAvatarUrl(discordUser) {
  if (discordUser.avatar) {
    const ext = discordUser.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${ext}?size=256`;
  }

  // Discord default avatar. Для новых аккаунтов discriminator обычно равен "0".
  try {
    const index = discordUser.discriminator && discordUser.discriminator !== '0'
      ? Number(discordUser.discriminator) % 5
      : Number((BigInt(discordUser.id) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch (_) {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

function cleanDiscordGuildNickname(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // Служебные префиксы Discord вида [Dep. EMS|GOV] не являются частью ника на сайте.
  // Убираем один или несколько блоков [...] только в начале строки.
  const cleaned = raw.replace(/^(?:\s*\[[^\]]*\]\s*)+/, '').trim();
  return cleaned || raw;
}

function getDiscordProfile(discordUser, guildMember = null, guildId = '') {
  const guildNicknameRaw = String(guildMember?.nick || '').trim();
  const guildNickname = cleanDiscordGuildNickname(guildNicknameRaw);
  const displayName = guildNickname || String(discordUser.global_name || discordUser.username || '').trim();
  return {
    discordId: String(discordUser.id || ''),
    discordUsername: String(discordUser.username || ''),
    displayName,
    email: String(discordUser.email || ''),
    avatarUrl: getDiscordAvatarUrl(discordUser),
    discordGuildNickname: guildNickname,
    discordGuildId: guildMember ? String(guildId || MAIN_GUILD_ID) : '',
  };
}


const DISCORD_FACTION_ALIASES = Object.freeze({
  'EMS': 'ems', 'FIB': 'fib', 'GOV': 'gov', 'LSPD': 'lspd', 'WN': 'wn', 'NG': 'ng',
  'LSSD': 'lssd', 'FP': 'fp', 'SASPA': 'fp', 'RM': 'rm', 'LCN': 'lcn', 'AM': 'am',
  'MM': 'mm', 'YAK': 'yak', 'LSV': 'lsv', 'MG': 'mg-13', 'MG13': 'mg-13',
  'MG-13': 'mg-13', 'ESB': 'esb',
});

function normalizeNicknameToken(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function parseDiscordGuildNickname(nickname) {
  const raw = String(nickname || '').trim();
  const match = raw.match(/^(?:\s*[\[\(]([^\]\)]*)[\]\)])\s*/);
  if (!match) return {factions: [], systemRole: null, direction: null};
  const parts = match[1].split(/[|/]/).map(x => x.trim()).filter(Boolean);
  if (!parts.length) return {factions: [], systemRole: null, direction: null};

  const first = normalizeNicknameToken(parts[0]);
  const assistantHeader = /^(DEP|D)(?:[.\s:_-]|$)/.test(first);
  const header = first.replace(/^(DEP|D)(?:[.\s:_-]?)/, '');

  const special = header.replace(/[^A-Z]/g, '');
  if (['GHETTO', 'MAFIA', 'STATE'].includes(special)) {
    return {
      factions: [],
      systemRole: 'chief_overseer',
      direction: special === 'GHETTO' ? 'ghetto' : special === 'MAFIA' ? 'mafia' : 'state',
    };
  }

  const factions = [];
  const assistantFactions = [];
  for (const part of parts) {
    let token = normalizeNicknameToken(part);
    const isDep = /^(DEP|D)(?:[.:\s_-]|$)/.test(token);
    if (isDep && !assistantHeader) break;
    token = token.replace(/^(DEP|D)(?:[.:\s_-]?)/, '');
    token = token.replace(/[^A-Z0-9-]/g, '');
    const faction = DISCORD_FACTION_ALIASES[token];
    if (faction) {
      if (assistantHeader) assistantFactions.push(faction);
      else factions.push(faction);
    }
  }

  return {
    factions: [...new Set(factions)],
    assistantFactions: [...new Set(assistantFactions)],
    systemRole: assistantHeader ? 'curator_assistant' : (factions.length ? 'curator' : null),
    direction: null,
  };
}

function memberRoleSet(member) {
  return new Set(Array.isArray(member?.roles) ? member.roles.map(String) : []);
}

function deriveDiscordRoleState(mainMember, secondaryMember = null, guildNickname = '') {
  const mainRoles = memberRoleSet(mainMember);
  const secondaryRoles = memberRoleSet(secondaryMember);
  const roles = new Set([...mainRoles, ...secondaryRoles]);
  const factionMatches = Object.entries(DISCORD_FACTION_ROLES)
    .filter(([roleId]) => roles.has(roleId))
    .map(([roleId, meta]) => ({roleId, ...meta}));
  const nicknameState = parseDiscordGuildNickname(guildNickname);
  const roleFactions = factionMatches.map((x) => x.faction);
  const nicknameFactions = nicknameState.systemRole === 'curator_assistant'
    ? nicknameState.assistantFactions
    : nicknameState.factions;
  const factionCodes = nicknameState.systemRole
    ? [...new Set([...nicknameFactions])]
    : [...new Set(roleFactions)];
  const faction = nicknameState.factions[0] || roleFactions[0] || null;
  const direction = nicknameState.direction || factionMatches.find(x => x.faction === faction)?.direction || null;
  const isCuratorAssistant = nicknameState.systemRole === 'curator_assistant' ||
    [...DISCORD_ASSISTANT_ROLES].some((roleId) => roles.has(roleId));
  let serverLevel = null;
  Object.entries(DISCORD_LEVEL_ROLES).forEach(([roleId, level]) => {
    if (roles.has(roleId) && (serverLevel === null || level > serverLevel)) serverLevel = level;
  });
  const hasAccessRole = [...roles].some((roleId) => DISCORD_ACCESS_ROLES.has(roleId)) || factionCodes.length > 0 || !!nicknameState.systemRole;
  return {
    roleIds: [...mainRoles],
    secondaryRoleIds: [...secondaryRoles],
    allRoleIds: [...roles],
    faction,
    factionCodes,
    direction,
    factionMatches: factionCodes,
    nicknameSystemRole: nicknameState.systemRole,
    isCuratorAssistant,
    serverLevel,
    hasAccessRole,
  };
}

function inferAutomaticSystemRole(roleState) {
  if (roleState.isCuratorAssistant) return 'curator_assistant';
  if (roleState.faction) return 'leader';
  if (roleState.serverLevel !== null) return 'server_admin';
  return null;
}

function hasUsableRegisteredRole(user) {
  return !!(user && ['leader', 'curator_assistant', 'curator', 'chief_overseer', 'server_admin', 'site_admin'].includes(user.systemRole));
}

function requiredPermissionsForRole(systemRole, currentPermissions = []) {
  const perms = new Set(Array.isArray(currentPermissions) ? currentPermissions.filter((x) => typeof x === 'string') : []);
  if (systemRole === 'curator') {
    perms.add('manageDuties');
    perms.add('editDutyTasks');
    perms.add('viewUsers');
  } else if (systemRole === 'curator_assistant') {
    perms.add('manageDuties');
    perms.add('viewUsers');
    perms.delete('editDutyTasks');
  } else if (systemRole === 'chief_overseer') {
    perms.add('manageDuties');
    perms.add('viewAudit');
  } else if (systemRole === 'site_admin') {
    ['editLeaderNickname', 'manageDuties', 'editDutyTasks', 'viewAudit', 'manageArchive', 'viewUsers', 'manageUsers', 'manageAdmins']
      .forEach((p) => perms.add(p));
  }
  return [...perms];
}

function buildDiscordUserPatch(current, roleState, membership, {completeRoleSnapshot = true, guildChecks = {main: true, secondary: true}} = {}) {
  const mainChecked = guildChecks?.main !== false;
  const secondaryChecked = guildChecks?.secondary !== false;
  const previousGuildRoles = current.discordGuildRoleIds && typeof current.discordGuildRoleIds === 'object'
    ? current.discordGuildRoleIds
    : {};
  const previousMembership = current.discordGuildMembership && typeof current.discordGuildMembership === 'object'
    ? current.discordGuildMembership
    : {};
  const mainRoles = mainChecked
    ? roleState.roleIds
    : (Array.isArray(previousGuildRoles.main) ? previousGuildRoles.main : (Array.isArray(current.discordRoleIds) ? current.discordRoleIds : []));
  const secondaryRoles = secondaryChecked
    ? (roleState.secondaryRoleIds || [])
    : (Array.isArray(previousGuildRoles.secondary) ? previousGuildRoles.secondary : (Array.isArray(current.discordSecondaryRoleIds) ? current.discordSecondaryRoleIds : []));

  const patch = {
    discordNicknameSystemRole: roleState.nicknameSystemRole || null,
    discordFactionCodes: roleState.factionCodes,
    discordGuildRoleIds: {main: mainRoles, secondary: secondaryRoles},
    discordGuildMembership: {
      main: mainChecked ? !!membership.main : previousMembership.main === true,
      secondary: secondaryChecked ? !!membership.secondary : previousMembership.secondary === true,
    },
    discordGuildChecks: {main: mainChecked, secondary: secondaryChecked},
    discordSyncPartial: !completeRoleSnapshot,
    discordRolesSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (mainChecked) patch.discordRoleIds = roleState.roleIds;
  if (secondaryChecked) patch.discordSecondaryRoleIds = roleState.secondaryRoleIds || [];
  if (roleState.faction || completeRoleSnapshot) patch.discordFaction = roleState.faction;
  if (roleState.direction || completeRoleSnapshot) patch.discordDirection = roleState.direction;

  let nextRole = roleState.nicknameSystemRole || current.systemRole || inferAutomaticSystemRole(roleState);
  const protectedRoles = new Set(['curator', 'chief_overseer', 'site_admin']);
  if (roleState.isCuratorAssistant && !protectedRoles.has(nextRole)) {
    nextRole = 'curator_assistant';
    patch.discordAutoSystemRole = 'curator_assistant';
  } else if (completeRoleSnapshot && !roleState.isCuratorAssistant && current.discordAutoSystemRole === 'curator_assistant' && nextRole === 'curator_assistant') {
    nextRole = roleState.faction ? 'leader' : (roleState.serverLevel !== null ? 'server_admin' : nextRole);
    patch.discordAutoSystemRole = admin.firestore.FieldValue.delete();
  } else if (completeRoleSnapshot && nextRole === 'leader' && !roleState.faction && roleState.serverLevel !== null) {
    nextRole = 'server_admin';
  }

  if (nextRole && nextRole !== current.systemRole) patch.systemRole = nextRole;
  if (roleState.serverLevel !== null) patch.serverLevel = roleState.serverLevel;

  // Фракция и системная роль — независимые измерения. Администратор/помощник
  // может одновременно принадлежать к LSPD/YAK/WN и т.п., поэтому faction
  // никогда не очищается только из-за systemRole.
  if (roleState.faction) {
    patch.faction = roleState.faction;
    patch.discordAutoFaction = roleState.faction;
  } else if (completeRoleSnapshot && current.discordAutoFaction && current.faction === current.discordAutoFaction) {
    // Очищаем только фракцию, которую раньше поставил сам Discord, и только
    // когда все разрешённые серверы реально удалось проверить. Ручную фракцию не трогаем.
    patch.faction = null;
    patch.discordAutoFaction = admin.firestore.FieldValue.delete();
  }

  patch.curatedFactions = roleState.nicknameSystemRole === 'chief_overseer'
    ? []
    : roleState.factionCodes;
  if (roleState.nicknameSystemRole === 'chief_overseer') patch.direction = roleState.direction;
  patch.permissions = requiredPermissionsForRole(nextRole || current.systemRole, current.permissions);
  return patch;
}

async function getOAuthGuildMember(accessToken, guildId) {
  try {
    const response = await axios.get(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
      headers: {Authorization: `Bearer ${accessToken}`},
      validateStatus: (status) => status === 200 || status === 404 || status === 403,
    });
    if (response.status === 200) return response.data;
    if (response.status === 404) return null;
    const err = new Error(`Discord не разрешил проверить участие на сервере ${guildId}. Повторите вход и подтвердите запрошенные разрешения Discord.`);
    err.status = 502;
    err.code = 'discord-member-check-forbidden';
    throw err;
  } catch (error) {
    if (error && error.code === 'discord-member-check-forbidden') throw error;
    console.warn(`Discord OAuth member lookup failed for ${guildId}:`, error.response?.data || error.message);
    const err = new Error(`Не удалось проверить участие на Discord-сервере ${guildId}. Доступ аккаунта не изменён; попробуйте войти ещё раз.`);
    err.status = 502;
    err.code = 'discord-member-check-failed';
    throw err;
  }
}

function discordAuthErrorPayload(code, message) {
  return {
    type: 'DISCORD_AUTH_ERROR',
    code: code || 'access-denied',
    message: message || 'Не удалось подтвердить доступ через Discord.',
  };
}

function popupHtml(payload) {
  const safe = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Discord Login</title></head><body><script>
    const data=${safe};
    if(window.opener){
      try{window.opener.postMessage(data,'https://gta5rp-hub.web.app')}catch(e){}
      try{window.opener.postMessage(data,'https://gta5rp-hub.firebaseapp.com')}catch(e){}
    }
    window.close();
  </script></body></html>`;
}

async function syncFirebaseAuthUser(uid, profile) {
  const patch = {
    displayName: profile.displayName || profile.discordUsername || undefined,
    photoURL: profile.avatarUrl || undefined,
  };
  if (profile.email) patch.email = profile.email;

  // undefined нельзя передавать в Auth update/create.
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  try {
    await admin.auth().updateUser(uid, patch);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      await admin.auth().createUser({uid, ...patch});
      return;
    }
    throw error;
  }
}

async function syncFirestoreProfile(uid, profile, roleState, membership, {completeRoleSnapshot = true, guildChecks = {main: true, secondary: true}} = {}) {
  const userRef = firestore.collection('users').doc(uid);
  const pendingRef = firestore.collection('pendingUsers').doc(uid);
  const userSnap = await userRef.get();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (userSnap.exists) {
    const current = userSnap.data() || {};
    const manuallyDisabled = current.disabledByAdmin === true;
    const deleted = current.deleted === true;
    const patch = {
      avatarUrl: profile.avatarUrl || '',
      discordId: profile.discordId,
      discordUsername: profile.discordUsername,
      discordDisplayName: profile.displayName,
      discordGuildNickname: profile.discordGuildNickname || '',
      discordGuildId: profile.discordGuildId || '',
      discordSyncedAt: now,
      discordAccessDisabled: false,
      discordAccessDisabledReason: admin.firestore.FieldValue.delete(),
      active: !manuallyDisabled && !deleted,
      updatedAt: now,
      ...buildDiscordUserPatch(current, roleState, membership, {completeRoleSnapshot, guildChecks}),
    };

    if (profile.email) patch.email = profile.email;
    if (profile.displayName) patch.displayName = profile.displayName;

    await userRef.set(patch, {merge: true});
    try { await pendingRef.delete(); } catch (_) {}
    return {created: false, user: {...current, ...patch}};
  }

  const systemRole = inferAutomaticSystemRole(roleState);
  if (!systemRole) {
    const err = new Error('На Discord-серверах не найдена роль, которая даёт доступ к сайту.');
    err.status = 403;
    err.code = 'missing-project-role';
    throw err;
  }

  const serverLevel = roleState.serverLevel !== null ? roleState.serverLevel : 2;
  const userData = {
    uid,
    email: profile.email || 'no-email@discord.user',
    displayName: profile.displayName || profile.discordUsername || 'Discord user',
    avatarUrl: profile.avatarUrl || '',
    discordId: profile.discordId,
    discordUsername: profile.discordUsername,
    discordDisplayName: profile.displayName,
    discordGuildNickname: profile.discordGuildNickname || '',
    discordGuildId: profile.discordGuildId || '',
    discordRoleIds: roleState.roleIds,
    discordSecondaryRoleIds: roleState.secondaryRoleIds || [],
    discordGuildRoleIds: {main: roleState.roleIds, secondary: roleState.secondaryRoleIds || []},
    discordFaction: roleState.faction,
    discordDirection: roleState.direction,
    discordFactionCodes: roleState.factionCodes,
    discordGuildMembership: membership,
    discordGuildChecks: guildChecks,
    discordSyncPartial: !completeRoleSnapshot,
    discordRolesSyncedAt: now,
    discordSyncedAt: now,
    serverLevel,
    systemRole,
    faction: roleState.faction || null,
    discordAutoFaction: roleState.faction || null,
    direction: roleState.direction || null,
    curatedFactions: roleState.nicknameSystemRole === 'chief_overseer' ? [] : roleState.factionCodes,
    permissions: requiredPermissionsForRole(systemRole, []),
    active: true,
    disabledByAdmin: false,
    discordAccessDisabled: false,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await userRef.set(userData);
  try { await pendingRef.delete(); } catch (_) {}
  return {created: true, user: userData};
}

const ALLOWED_ORIGINS = new Set([
  'https://gta5rp-hub.web.app',
  'https://gta5rp-hub.firebaseapp.com',
]);

app.use(express.json({limit: '100kb'}));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function cleanString(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanStringArray(value, maxItems = 50) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => cleanString(v, 120)).filter(Boolean))].slice(0, maxItems);
}

function readCookie(req, name) {
  const raw = req.get('cookie') || '';
  const prefix = `${name}=`;
  const part = raw.split(';').map((v) => v.trim()).find((v) => v.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : '';
}

function sameOAuthState(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (_) {
    return false;
  }
}

async function readAuthUser(req, required = true) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    if (required) {
      const err = new Error('Authentication required');
      err.status = 401;
      throw err;
    }
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded;
  } catch (_) {
    const err = new Error('Invalid authentication token');
    err.status = 401;
    throw err;
  }
}

async function requireSiteAdmin(req) {
  const decoded = await readAuthUser(req, true);
  const snap = await firestore.collection('users').doc(decoded.uid).get();
  const user = snap.exists ? snap.data() : null;
  if (!user || user.active === false || user.deleted === true || user.systemRole !== 'site_admin') {
    const err = new Error('Insufficient permissions');
    err.status = 403;
    throw err;
  }
  return {uid: decoded.uid, user};
}

async function requireManageUsers(req) {
  const decoded = await readAuthUser(req, true);
  const snap = await firestore.collection('users').doc(decoded.uid).get();
  const user = snap.exists ? snap.data() : null;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  if (!user || user.active === false || user.deleted === true || (user.systemRole !== 'site_admin' && !permissions.includes('manageUsers'))) {
    const err = new Error('Insufficient permissions');
    err.status = 403;
    throw err;
  }
  return {uid: decoded.uid, user};
}

function sendApiError(res, error) {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('API error:', error);
  const fallbackCode = status === 403 ? 'permission-denied' : status === 401 ? 'unauthenticated' : status === 409 ? 'already-running' : status === 404 ? 'not-found' : 'internal';
  const code = cleanString(error.code, 80) || fallbackCode;
  res.status(status).json({error: error.message || 'Internal error', code});
}

app.post('/admin/approve-user', async (req, res) => {
  try {
    await requireSiteAdmin(req);
    const uid = cleanString(req.body.uid, 200);
    const allowedRoles = new Set([
      'curator_assistant', 'curator', 'chief_overseer', 'site_admin',
    ]);
    const systemRole = cleanString(req.body.systemRole, 40);
    if (!uid || !allowedRoles.has(systemRole)) {
      return res.status(400).json({error: 'Invalid user or role', code: 'invalid-argument'});
    }

    const pendingRef = firestore.collection('pendingUsers').doc(uid);
    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
      return res.status(404).json({error: 'Pending user not found', code: 'not-found'});
    }
    const pending = pendingSnap.data() || {};
    let serverLevel = Number.parseInt(req.body.serverLevel, 10);
    if (!Number.isInteger(serverLevel) || serverLevel < 2 || serverLevel > 6) serverLevel = 2;
    const allowedDirections = new Set(['state', 'ghetto', 'mafia']);
    const directionRaw = cleanString(req.body.direction, 40);
    const direction = systemRole === 'chief_overseer' && allowedDirections.has(directionRaw) ? directionRaw : null;
    if (systemRole === 'chief_overseer' && !direction) {
      return res.status(400).json({error: 'Overseer direction is required', code: 'invalid-argument'});
    }

    let permissions = [];
    if (systemRole === 'curator_assistant') {
      permissions = ['manageDuties', 'viewUsers'];
    } else if (systemRole === 'curator') {
      permissions = ['manageDuties', 'editDutyTasks', 'viewUsers'];
    } else if (systemRole === 'chief_overseer') {
      permissions = ['manageDuties', 'viewAudit'];
    } else if (systemRole === 'site_admin') {
      permissions = [
        'editLeaderNickname', 'manageDuties', 'editDutyTasks', 'viewAudit',
        'manageArchive', 'viewUsers', 'manageUsers', 'manageAdmins',
      ];
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const userData = {
      uid,
      email: cleanString(pending.email, 320) || 'no-email@discord.user',
      displayName: cleanString(pending.displayName, 120),
      avatarUrl: cleanString(pending.photoURL || pending.avatarUrl, 1000),
      discordId: cleanString(pending.discordId, 100),
      discordUsername: cleanString(pending.discordUsername, 120),
      discordDisplayName: cleanString(pending.discordDisplayName || pending.displayName, 120),
      discordGuildNickname: cleanString(pending.discordGuildNickname, 120),
      discordGuildId: cleanString(pending.discordGuildId, 100),
      discordRoleIds: cleanStringArray(pending.discordRoleIds, 100),
      discordSecondaryRoleIds: cleanStringArray(pending.discordSecondaryRoleIds, 100),
      discordGuildRoleIds: pending.discordGuildRoleIds || {main: [], secondary: []},
      discordFaction: cleanString(pending.discordFaction, 60) || null,
      discordDirection: cleanString(pending.discordDirection, 40) || null,
      discordGuildMembership: pending.discordGuildMembership || {},
      discordRolesSyncedAt: pending.discordRolesSyncedAt || now,
      discordSyncedAt: pending.updatedAt || now,
      serverLevel,
      systemRole,
      faction: cleanString(pending.discordFaction, 60) || null,
      discordAutoFaction: cleanString(pending.discordFaction, 60) || null,
      direction,
      curatedFactions: systemRole === 'site_admin' ? [] : cleanStringArray(req.body.curatedFactions, 50),
      permissions,
      active: true,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };

    const batch = firestore.batch();
    batch.set(firestore.collection('users').doc(uid), userData);
    batch.delete(pendingRef);
    await batch.commit();
    res.json({ok: true});
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/admin/deny-user', async (req, res) => {
  try {
    await requireSiteAdmin(req);
    const uid = cleanString(req.body.uid, 200);
    if (!uid) return res.status(400).json({error: 'Invalid user', code: 'invalid-argument'});
    await firestore.collection('pendingUsers').doc(uid).delete();
    res.json({ok: true});
  } catch (error) {
    sendApiError(res, error);
  }
});


app.post('/visits/start', async (req, res) => {
  try {
    const decoded = await readAuthUser(req, false);
    let user = null;
    if (decoded) {
      const snap = await firestore.collection('users').doc(decoded.uid).get();
      if (snap.exists) user = snap.data();
    }
    const sessionId = cleanString(req.body.sessionId, 100);
    if (!sessionId) return res.status(400).json({error: 'Invalid session', code: 'invalid-argument'});
    const page = cleanString(req.body.page, 80) || 'leaders';
    const ref = firestore.collection('visits').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set({
      sessionId,
      timestamp: now,
      entryAt: now,
      uid: decoded ? decoded.uid : null,
      email: user ? cleanString(user.email, 320) || null : null,
      role: user ? cleanString(user.systemRole, 60) || 'guest' : 'guest',
      isGuest: !user,
      page,
      lastPage: page,
      exitAt: null,
      duration: null,
    });
    res.json({ok: true, visitId: ref.id});
  } catch (error) {
    sendApiError(res, error);
  }
});

async function getVisitForSession(visitId, sessionId) {
  const ref = firestore.collection('visits').doc(visitId);
  const snap = await ref.get();
  if (!snap.exists || cleanString(snap.data().sessionId, 100) !== sessionId) {
    const err = new Error('Visit not found');
    err.status = 404;
    throw err;
  }
  return ref;
}

app.post('/visits/page', async (req, res) => {
  try {
    const visitId = cleanString(req.body.visitId, 200);
    const sessionId = cleanString(req.body.sessionId, 100);
    const page = cleanString(req.body.page, 80);
    if (!visitId || !sessionId || !page) {
      return res.status(400).json({error: 'Invalid visit data', code: 'invalid-argument'});
    }
    const ref = await getVisitForSession(visitId, sessionId);
    await ref.update({lastPage: page});
    res.json({ok: true});
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post('/visits/end', async (req, res) => {
  try {
    const visitId = cleanString(req.body.visitId, 200);
    const sessionId = cleanString(req.body.sessionId, 100);
    let duration = Number.parseInt(req.body.duration, 10);
    if (!Number.isInteger(duration) || duration < 0) duration = 0;
    duration = Math.min(duration, 7 * 24 * 60 * 60);
    if (!visitId || !sessionId) {
      return res.status(400).json({error: 'Invalid visit data', code: 'invalid-argument'});
    }
    const ref = await getVisitForSession(visitId, sessionId);
    await ref.update({
      exitAt: admin.firestore.FieldValue.serverTimestamp(),
      duration,
    });
    res.json({ok: true});
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get('/login', (req, res) => {
  if (!CLIENT_SECRET) {
    return res.type('html').status(503).send(popupHtml(discordAuthErrorPayload(
      'oauth-not-configured',
      'Вход через Discord временно недоступен: на сервере не настроен DISCORD_CLIENT_SECRET.',
    )));
  }
  const oauthState = crypto.randomBytes(24).toString('hex');
  res.set('Set-Cookie', `${OAUTH_STATE_COOKIE}=${encodeURIComponent(oauthState)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  const discordAuthUrl =
    `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    '&response_type=code&scope=identify%20email%20guilds%20guilds.members.read' +
    `&state=${encodeURIComponent(oauthState)}`;
  res.redirect(discordAuthUrl);
});

app.get('/auth', async (req, res) => {
  const {code, state: returnedState} = req.query;
  const expectedState = readCookie(req, OAUTH_STATE_COOKIE);
  res.set('Set-Cookie', `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  if (!code) {
    return res.type('html').status(400).send(popupHtml(discordAuthErrorPayload('oauth-cancelled', 'Discord не вернул код авторизации. Вход был отменён или не завершён.')));
  }
  if (!sameOAuthState(String(returnedState || ''), expectedState)) {
    return res.type('html').status(400).send(popupHtml(discordAuthErrorPayload('oauth-state-invalid', 'Не удалось подтвердить безопасность сессии входа. Обновите страницу и попробуйте ещё раз.')));
  }

  try {
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {headers: {'Content-Type': 'application/x-www-form-urlencoded'}},
    );

    const {access_token: accessToken} = tokenResponse.data;
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {Authorization: `Bearer ${accessToken}`},
    });

    const discordUser = userResponse.data;
    const uid = `discord:${discordUser.id}`;
    const existingRef = firestore.collection('users').doc(uid);
    const existingSnap = await existingRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : null;

    const [mainResult, secondaryResult] = await Promise.allSettled([
      getOAuthGuildMember(accessToken, MAIN_GUILD_ID),
      getOAuthGuildMember(accessToken, SECONDARY_GUILD_ID),
    ]);
    const guildChecks = {
      main: mainResult.status === 'fulfilled',
      secondary: secondaryResult.status === 'fulfilled',
    };
    if (!guildChecks.main && !guildChecks.secondary) {
      const firstError = mainResult.reason || secondaryResult.reason;
      throw firstError || Object.assign(new Error('Discord временно не дал проверить серверы проекта. Повторите вход позже.'), {status: 503, code: 'discord-member-check-failed'});
    }
    const mainMember = guildChecks.main ? mainResult.value : null;
    const secondaryMember = guildChecks.secondary ? secondaryResult.value : null;
    const membership = {main: !!mainMember, secondary: !!secondaryMember};
    const foundOnAnyServer = membership.main || membership.secondary;
    const completeRoleSnapshot = guildChecks.main && guildChecks.secondary;
    const guildNicknameForRoles = secondaryMember?.nick || mainMember?.nick || '';
    const roleState = deriveDiscordRoleState(mainMember, secondaryMember, guildNicknameForRoles);

    if (existing?.deleted === true) {
      return res.type('html').status(403).send(popupHtml(discordAuthErrorPayload('account-deleted', 'Ваш аккаунт удалён администратором сайта. Обратитесь к администрации, если это ошибка.')));
    }
    if (existing?.disabledByAdmin === true) {
      return res.type('html').status(403).send(popupHtml(discordAuthErrorPayload('account-disabled-by-admin', 'Ваш аккаунт отключён администратором сайта. Обратитесь к администрации, если это ошибка.')));
    }

    if (!foundOnAnyServer) {
      // Если один из серверов Discord не удалось проверить, нельзя делать вывод,
      // что пользователя там нет. Ничего не деактивируем и разрешаем повторить вход.
      if (!completeRoleSnapshot) {
        const failedGuilds = [
          !guildChecks.main ? MAIN_GUILD_ID : null,
          !guildChecks.secondary ? SECONDARY_GUILD_ID : null,
        ].filter(Boolean).join(', ');
        return res.type('html').status(503).send(popupHtml(discordAuthErrorPayload(
          'discord-member-check-partial',
          `Discord временно не дал проверить сервер ${failedGuilds}. Аккаунт на сайте не отключён. Повторите вход через несколько секунд.`,
        )));
      }
      if (existingSnap.exists) {
        await existingRef.set({
          discordGuildMembership: membership,
          discordGuildChecks: guildChecks,
          discordSyncPartial: false,
          discordAccessDisabled: true,
          discordAccessDisabledReason: 'not-found-on-allowed-guilds',
          active: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }
      return res.type('html').status(403).send(popupHtml(discordAuthErrorPayload(
        'not-in-project-guild',
        `Discord подтвердил, что ваш аккаунт не состоит ни на одном из серверов проекта (${MAIN_GUILD_ID} или ${SECONDARY_GUILD_ID}). Вступите на разрешённый сервер и повторите вход.`,
      )));
    }

    // Для уже зарегистрированного пользователя достаточно подтверждённого членства хотя бы на одном
    // разрешённом сервере. Это защищает от ложной блокировки, если конкретный ID роли был изменён.
    // Для первого входа роль всё равно должна быть известна, чтобы безопасно определить системную роль.
    if (!roleState.hasAccessRole && !hasUsableRegisteredRole(existing)) {
      return res.type('html').status(403).send(popupHtml(discordAuthErrorPayload(
        'missing-project-role',
        'Discord подтвердил сервер, но не обнаружил роль, по которой можно определить доступ к сайту. Обратитесь к администратору и укажите свой Discord ID.',
      )));
    }

    const profileMember = secondaryMember?.nick ? secondaryMember : (mainMember || secondaryMember);
    const profileGuildId = profileMember === secondaryMember ? SECONDARY_GUILD_ID : MAIN_GUILD_ID;
    const profile = getDiscordProfile(discordUser, profileMember, profileGuildId);

    await syncFirebaseAuthUser(uid, profile);
    await syncFirestoreProfile(uid, profile, roleState, membership, {completeRoleSnapshot, guildChecks});

    const firebaseToken = await admin.auth().createCustomToken(uid);
    const payload = {
      type: 'FIREBASE_TOKEN',
      token: firebaseToken,
      displayName: profile.displayName,
      discordUsername: profile.discordUsername,
      discordGuildNickname: profile.discordGuildNickname,
      discordGuildId: profile.discordGuildId,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
    };
    return res.type('html').send(popupHtml(payload));
  } catch (error) {
    console.error('Error during Discord OAuth flow:', error.response?.data || error);
    const code = cleanString(error.code, 80) || 'oauth-failed';
    const message = error.message && !/^Request failed with status code/.test(error.message)
      ? error.message
      : 'Discord не завершил авторизацию. Попробуйте ещё раз; если ошибка повторяется, обратитесь к администратору сайта.';
    return res.type('html').status(Number(error.status) || 500).send(popupHtml(discordAuthErrorPayload(code, message)));
  }
});

exports.api = functions.https.onRequest(app);
