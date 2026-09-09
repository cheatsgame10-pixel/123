'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../domain');
const mapping = require('../discord-roles.json');
const {generateTasks, availableTasks} = require('../duty-service');
const guild = mapping.primaryGuildId;
const secondary = '1512812941064409148';
const factions = [{id: 'lsv', forumKey: 'LSV', category: 'street'}, {id: 'mg13', forumKey: 'MG-13', category: 'street'},
  {id: 'ems', forumKey: 'EMS', category: 'gov'}, {id: 'rm', forumKey: 'RM', category: 'syndicate'}];
const member = roles => ({[guild]: {roles}, [secondary]: {roles: []}});
const assistant = {uid: 'a', active: true, systemRole: 'curator_assistant', permissions: [], curatedFactions: ['lsv'], displayName: 'Алексей'};
const colleague = {...assistant, uid: 'b', displayName: 'Борис'};
const curator = {...assistant, uid: 'c', systemRole: 'curator'};
const week = () => ({factionId: 'lsv', weekEnd: '2026-09-13T20:59:59.999Z', locked: false,
  tasks: [{id: 'task', name: 'Проверить задачи', assignees: ['a', 'b'], completedBy: ['b'], assigneeNames: {a: 'Алексей', b: 'Борис'}}]});
const now = new Date('2026-09-08T12:00:00Z');

test('Ghetto assistant keeps two concrete factions, not a category assignment', () => {
  const user = d.resolveDiscordAccess({}, member(['1512978631461306386', '1512978631461306385', '1512978631507574816']), factions);
  assert.equal(user.active, true); assert.equal(user.systemRole, 'curator_assistant');
  assert.deepEqual(user.curatedFactions, ['lsv', 'mg13']); assert.equal(user.direction, 'ghetto');
  assert.deepEqual(user.permissions, ['manageDuties', 'viewUsers']);
});
test('Removed role clears old faction and auto privilege without changing old weeks', () => {
  const historical = week(); const before = structuredClone(historical);
  const current = {...assistant, curatedFactions: ['lsv'], discordManagedRole: true};
  const user = d.resolveDiscordAccess(current, member(['1512978631461306385', '1512978631507574816']), factions);
  assert.deepEqual(user.curatedFactions, ['mg13']); assert.deepEqual(historical, before);
  assert.deepEqual(user.dutyHistoryFactions, ['lsv']);
  assert.equal(historical.tasks[0].assigneeNames.a, 'Алексей');
});
test('Removing assistant role removes its permissions; unmapped manual senior levels are preserved', () => {
  const user = d.resolveDiscordAccess({...assistant, discordManagedRole: true}, member(['1512978631461306386']), factions);
  assert.equal(user.systemRole, 'leader'); assert.deepEqual(user.permissions, []);
  const senior = d.resolveDiscordAccess({...curator, serverLevel: 6}, member(['1512978631461306386', '1512978631507574821']), factions);
  assert.equal(senior.serverLevel, 6); assert.equal(senior.systemRole, 'curator');
});
test('Missing membership and missing qualifying roles both deny access, including former admins', () => {
  const admin = {active: true, systemRole: 'site_admin', permissions: ['manageUsers']};
  for (const members of [{}, member([])]) {
    const result = d.resolveDiscordAccess(admin, members, factions);
    assert.equal(result.active, false); assert.equal(result.systemRole, null); assert.deepEqual(result.curatedFactions, []);
    assert.equal(result.manualSystemRole, 'site_admin');
  }
});
test('Membership on both required servers is mandatory; roles on the primary server grant the mapped access', () => {
  const members = {[secondary]: {roles: ['second-assistant']}};
  assert.equal(d.resolveDiscordAccess({}, members, factions).active, false);
  assert.equal(d.resolveDiscordAccess({}, {[guild]: {roles: ['1512978631461306378']}}, factions).active, false);
  const both = {...member(['1512978631461306378']), [secondary]: {roles: []}};
  assert.equal(d.resolveDiscordAccess({}, both, factions).systemRole, 'leader');
  const custom = structuredClone(mapping); custom.guilds[secondary].assistantRoles = ['second-assistant'];
  assert.equal(d.resolveDiscordAccess({}, {[guild]: {roles: []}, [secondary]: {roles: ['second-assistant']}}, factions, custom).systemRole, 'curator_assistant');
});
test('Role IDs never match across different guilds', () => {
  assert.equal(d.resolveDiscordAccess({}, {'1512812941064409148': {roles: ['1512978631461306378']}}, factions).active, false);
});
test('Roleless existing users are denied; manual deactivation and deletion remain effective', () => {
  const members = member(['1512978631461306378']);
  assert.equal(d.resolveDiscordAccess({active: false}, members, factions).active, false);
  assert.equal(d.resolveDiscordAccess({active: false, discordAccessDenied: true}, members, factions).active, true);
  assert.equal(d.resolveDiscordAccess({active: false, discordAccessDenied: true, manualDisabled: true}, members, factions).active, false);
  assert.equal(d.resolveDiscordAccess({deleted: true}, members, factions).active, false);
});
test('Discord administrator level does not grant website administrator role', () => {
  const user = d.resolveDiscordAccess({}, member(['1512978631507574821', '1546838130298982460']), factions);
  assert.equal(user.serverLevel, 3); assert.equal(user.systemRole, 'server_admin'); assert.equal(d.isAdmin(user), false);
});
test('Unknown configured faction fails explicitly instead of silently widening access', () => {
  assert.throws(() => d.resolveDiscordAccess({}, member(['1512978631461306378']), []), /не найдена/);
});
test('Curator defaults and separately granted task editing work without a database migration', () => {
  assert.equal(d.hasPerm(curator, 'editDutyTasks'), true);
  assert.equal(d.hasPerm(assistant, 'editDutyTasks'), false);
  assert.equal(d.hasPerm({...assistant, permissions: ['editDutyTasks']}, 'editDutyTasks'), true);
  const changed = d.updateTask(week(), {action: 'tasks', names: ['Проверить статьи']}, {...assistant, permissions: ['editDutyTasks']}, [], factions, now);
  assert.equal(changed[0].name, 'Проверить статьи');
});
test('Assistant may only change their own assignment and own completion', () => {
  const result = d.updateTask(week(), {action: 'assignees', taskId: 'task', assignees: ['b']}, assistant, [assistant, colleague], factions, now);
  assert.deepEqual(result[0].assignees, ['b']); assert.deepEqual(result[0].completedBy, ['b']);
  assert.throws(() => d.updateTask(week(), {action: 'assignees', taskId: 'task', assignees: ['a']}, assistant, [assistant, colleague], factions, now), /Нельзя менять/);
  assert.throws(() => d.updateTask(week(), {action: 'complete', taskId: 'task', done: true}, curator, [], factions, now), /только назначенную/);
});
test('Completion is idempotent, never changes colleague completion, and snapshots the name', () => {
  const first = d.updateTask(week(), {action: 'complete', taskId: 'task', done: true}, assistant, [], factions, now);
  const second = d.updateTask({...week(), tasks: first}, {action: 'complete', taskId: 'task', done: true}, assistant, [], factions, now);
  assert.deepEqual(first, second); assert.deepEqual(second[0].completedBy, ['b', 'a']);
  assert.equal(second[0].assigneeNames.a, 'Алексей');
});
test('Curator can assign helpers but cannot change another curator assignment', () => {
  const targetWeek = week(); targetWeek.tasks[0].assignees = [];
  const people = [assistant, colleague, curator, {...curator, uid: 'other-curator'}];
  assert.equal(d.updateTask(targetWeek, {action: 'assignees', taskId: 'task', assignees: ['a', 'b']}, curator, people, factions, now)[0].assignees.length, 2);
  assert.throws(() => d.updateTask(targetWeek, {action: 'assignees', taskId: 'task', assignees: ['other-curator']}, curator, people, factions, now), /Нельзя менять/);
});
test('Cross-faction changes and changes after the deadline are denied on the server', () => {
  assert.throws(() => d.updateTask(week(), {action: 'tasks', names: []}, {...curator, curatedFactions: ['rm']}, [], factions, now), /Нет доступа/);
  assert.throws(() => d.updateTask(week(), {action: 'complete', taskId: 'task', done: true}, assistant, [], factions, new Date('2026-09-13T21:00:00Z')), /Прошедшая/);
});
test('Week boundary is Monday at Moscow midnight regardless of host timezone', () => {
  assert.equal(d.weekKey(new Date('2026-09-13T20:59:59Z')), '2026-09-07');
  assert.equal(d.weekKey(new Date('2026-09-13T21:00:00Z')), '2026-09-14');
  assert.equal(d.weekDates('2026-09-14').weekStart, '2026-09-13T21:00:00.000Z');
  assert.throws(() => d.weekDates('2026-09-15'), /понедельник/);
});
test('Deleted tasks disappear from future defaults and an empty template remains empty', () => {
  const catalog = [{name: 'Проверить задачи', factionId: '*', active: false}];
  assert.equal(availableTasks('lsv', catalog).includes('Проверить задачи'), false);
  d.REMOVED_TASKS.forEach(name => assert.equal(availableTasks('lsv', []).includes(name), false));
  assert.deepEqual(generateTasks({factionId: 'lsv', key: '2026-09-14', template: {tasks: []}, catalog: [], users: []}), []);
});
test('Preview and next-week generation choose the same active assignees within the faction', () => {
  const input = {factionId: 'lsv', key: '2026-09-14', template: {tasks: ['Проверить задачи', 'Проверить статьи'], assignmentMode: 'assistants'}, catalog: [], users: [assistant, colleague, {...assistant, uid: 'off', active: false}, {...assistant, uid: 'foreign', curatedFactions: ['rm']}]};
  const project = tasks => tasks.map(({id, ...task}) => task);
  assert.deepEqual(project(generateTasks(input)), project(generateTasks(input)));
  assert.deepEqual(new Set(generateTasks(input).flatMap(t => t.assignees)), new Set(['a', 'b']));
});
