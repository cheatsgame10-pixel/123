'use strict';

const config = require('./discord-roles.json');
const ROLE_DEFAULTS = {
  curator_assistant: ['manageDuties', 'viewUsers'],
  curator: ['manageDuties', 'editDutyTasks', 'viewUsers'],
  chief_overseer: ['manageDuties', 'viewUsers', 'viewAudit'],
};
const STAFF = ['curator_assistant', 'curator', 'chief_overseer', 'server_admin'];
const REMOVED_TASKS = ['Проверить активность сотрудников', 'Проверить склад', 'Проверить пополнение казны'];
const unique = values => [...new Set(values)];
const nameOf = user => String(user?.discordGuildNickname || user?.displayName || user?.discordDisplayName || user?.discordUsername || 'Пользователь без имени');
const active = user => !!user && user.active === true && user.deleted !== true;
const isAdmin = user => active(user) && user.systemRole === 'site_admin';
const hasPerm = (user, permission) => isAdmin(user) || (active(user) && STAFF.includes(user.systemRole) &&
  [...(user.permissions || []), ...(ROLE_DEFAULTS[user.systemRole] || [])].includes(permission));
const scopes = (user, factions) => isAdmin(user) ? factions.filter(f => f.active !== false).map(f => f.id) :
  user?.systemRole === 'chief_overseer' && user.direction
    ? factions.filter(f => f.active !== false && ({state: 'gov', ghetto: 'street', mafia: 'syndicate'})[user.direction] === f.category).map(f => f.id)
    : user?.curatedFactions || [];
const scoped = (user, permission, fid, factions) => hasPerm(user, permission) && scopes(user, factions).includes(fid);
const canAssign = (user, target, fid, factions) => scoped(user, 'manageDuties', fid, factions) && active(target) &&
  ['curator', 'curator_assistant'].includes(target.systemRole) && (target.curatedFactions || []).includes(fid) &&
  (user.uid === target.uid || isAdmin(user) || (user.systemRole !== 'curator_assistant' && target.systemRole === 'curator_assistant'));
const archiveEditor = (user, fid, factions) => scoped(user, 'manageDuties', fid, factions) &&
  (isAdmin(user) || user.systemRole === 'chief_overseer' || Number(user.serverLevel) >= 6);

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function requireValue(condition, message, status = 403) { if (!condition) fail(message, status); }
function taskNames(values) {
  requireValue(Array.isArray(values) && values.length <= 50, 'Не более 50 задач', 400);
  requireValue(values.every(v => typeof v === 'string' && v.trim() && v.trim().length <= 120), 'Некорректная задача', 400);
  return unique(values.map(v => v.trim())).filter(v => !REMOVED_TASKS.includes(v));
}
function weekKey(date = new Date()) {
  const local = new Date(date.getTime() + 3 * 3600000);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  return local.toISOString().slice(0, 10);
}
function weekDates(key) {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(key), 'Некорректная неделя', 400);
  const start = new Date(`${key}T00:00:00+03:00`);
  requireValue(Number.isFinite(+start) && weekKey(start) === key, 'Неделя должна начинаться в понедельник', 400);
  return {weekStart: start.toISOString(), weekEnd: new Date(+start + 7 * 86400000 - 1).toISOString()};
}
const isLocked = (week, now = new Date()) => week.locked === true || new Date(week.weekEnd) < now;

function resolveDiscordAccess(current, members, factions, mapping = config) {
  const dutyHistoryFactions = unique([...(current.dutyHistoryFactions || []), ...(current.curatedFactions || [])]);
  const codes = []; const levels = []; const roles = []; let assistant = false;
  const memberships = Object.keys(mapping.guilds).filter(id => members[id]);
  for (const guildId of memberships) {
    const rules = mapping.guilds[guildId];
    for (const id of members[guildId].roles || []) {
      if (rules.factions[id]) codes.push(rules.factions[id]);
      if (rules.assistantRoles.includes(id)) assistant = true;
      if (rules.levels[id]) levels.push(rules.levels[id]);
      if (rules.systemRoles[id]) roles.push(rules.systemRoles[id]);
    }
  }
  const manualLevel = current.manualServerLevel || (!current.discordManagedLevel && Number(current.serverLevel) >= 4 ? Number(current.serverLevel) : null);
  const manual = ['curator', 'chief_overseer', 'site_admin'].includes(current.manualSystemRole) ? current.manualSystemRole : (['curator', 'chief_overseer', 'site_admin'].includes(current.systemRole) && !current.discordManagedRole ? current.systemRole : null);
  const explicit = current.permissionOverrides || (current.permissions || []).filter(p => !(current.discordAutoPermissions || ROLE_DEFAULTS[current.systemRole] || []).includes(p));
  const requiredGuilds = Object.keys(mapping.guilds);
  const isMemberOfAllRequiredGuilds = requiredGuilds.every(id => memberships.includes(id));
  const eligible = isMemberOfAllRequiredGuilds && (codes.length > 0 || assistant || levels.length > 0 || roles.length > 0);
  if (!eligible) return {active: false, manualServerLevel: manualLevel, dutyHistoryFactions, manualSystemRole: manual || null, permissionOverrides: explicit, systemRole: null, serverLevel: 0, faction: null, direction: null,
    curatedFactions: [], discordFactionCodes: [], discordGuildIds: memberships, permissions: [], discordAutoPermissions: [],
    discordAccessDenied: true,
    deactivatedReason: !isMemberOfAllRequiredGuilds ? 'discord-not-member' : 'discord-no-roles'};

  const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const matched = unique(codes).map(code => {
    const faction = factions.find(f => f.active !== false && [f.id, f.forumKey, f.name].some(v => normalize(v) === normalize(code)));
    if (!faction) fail(`Фракция ${code} из Discord не найдена в настройках сайта`, 409);
    return faction;
  });
  const mapped = ['site_admin', 'chief_overseer', 'curator', 'curator_assistant', 'server_admin', 'leader'].find(r => roles.includes(r));
  const systemRole = manual || mapped || (assistant ? 'curator_assistant' : levels.length ? 'server_admin' : 'leader');
  const directions = unique(matched.map(f => ({gov: 'state', street: 'ghetto', syndicate: 'mafia'})[f.category]).filter(Boolean));
  const direction = systemRole === 'chief_overseer' ? current.direction || directions[0] || null : directions.length === 1 ? directions[0] : null;
  const auto = ROLE_DEFAULTS[systemRole] || [];
  const manuallyDisabled = current.manualDisabled === true || (current.active === false && current.discordAccessDenied !== true);
  const result = {active: !manuallyDisabled && current.deleted !== true, dutyHistoryFactions, systemRole, serverLevel: manualLevel || (levels.length ? Math.max(...levels) : 2), manualServerLevel: manualLevel, discordManagedLevel: !manualLevel,
    faction: systemRole === 'leader' ? matched[0]?.id || null : null,
    direction, curatedFactions: systemRole === 'site_admin' ? [] : matched.map(f => f.id),
    discordFactionCodes: unique(codes), discordGuildIds: memberships, discordAccessDenied: false,
    deactivatedReason: manuallyDisabled ? current.deactivatedReason || 'manual' : '',
    permissions: unique([...explicit, ...auto]), permissionOverrides: explicit, discordAutoPermissions: auto,
    discordManagedRole: !manual, manualSystemRole: manual || null};
  if (systemRole === 'chief_overseer') result.curatedFactions = scopes(result, factions);
  return result;
}

function updateTask(week, input, user, users, factions, now = new Date()) {
  const fid = week.factionId;
  requireValue(scoped(user, 'manageDuties', fid, factions), 'Нет доступа к обязанностям этой фракции');
  const tasks = structuredClone(week.tasks || []);
  const locked = isLocked(week, now);
  if (input.action === 'tasks') {
    requireValue(locked ? archiveEditor(user, fid, factions) : scoped(user, 'editDutyTasks', fid, factions), 'Нет права редактировать задачи');
    return taskNames(input.names).map(name => tasks.find(t => t.name === name) ||
      {id: require('crypto').randomUUID(), name, assignees: [], completedBy: [], assigneeNames: {}});
  }
  requireValue(!locked, 'Прошедшая неделя закрыта');
  const task = tasks.find(t => t.id === input.taskId);
  requireValue(task, 'Задача не найдена', 404);
  if (input.action === 'assignees') {
    requireValue(Array.isArray(input.assignees) && input.assignees.length <= 2 && input.assignees.every(v => typeof v === 'string'), 'Можно назначить не более двух администраторов', 400);
    const next = unique(input.assignees);
    const previous = task.assignees || [];
    const changed = unique([...next.filter(id => !previous.includes(id)), ...previous.filter(id => !next.includes(id))]);
    for (const id of changed) requireValue(canAssign(user, users.find(u => u.uid === id), fid, factions), 'Нельзя менять назначение этого администратора');
    task.assignees = next;
    task.completedBy = (task.completedBy || []).filter(id => next.includes(id));
    task.assigneeNames = {...task.assigneeNames};
    next.forEach(id => { const person = users.find(u => u.uid === id); if (person) task.assigneeNames[id] = nameOf(person); });
  } else if (input.action === 'complete') {
    requireValue((task.assignees || []).includes(user.uid), 'Можно закрыть только назначенную вам задачу');
    requireValue(typeof input.done === 'boolean', 'Некорректный статус', 400);
    task.completedBy = input.done ? unique([...(task.completedBy || []), user.uid]) : (task.completedBy || []).filter(id => id !== user.uid);
    task.assigneeNames = {...task.assigneeNames, [user.uid]: nameOf(user)};
  } else fail('Неизвестное действие');
  return tasks;
}

module.exports = {ROLE_DEFAULTS, REMOVED_TASKS, nameOf, active, isAdmin, hasPerm, scopes, scoped, canAssign, archiveEditor,
  fail, requireValue, taskNames, weekKey, weekDates, isLocked, resolveDiscordAccess, updateTask};
