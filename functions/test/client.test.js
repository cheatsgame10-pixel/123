'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function client() {
  const style = new Map(); const elements = new Map(); const storage = new Map(); const notices = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {hidden: false, textContent: '', disabled: false, innerHTML: '', classList: {toggle() {}, add() {}, remove() {}}});
    return elements.get(id);
  };
  const document = {addEventListener() {}, removeEventListener() {}, getElementById: element, querySelector: element, querySelectorAll: () => [],
    body: element('body'), documentElement: {dataset: {}, style: {setProperty: (k, v) => style.set(k, v), removeProperty: k => style.delete(k)}}};
  const auth = {}; const db = {};
  const firebase = {initializeApp() {}, auth: () => auth, firestore: Object.assign(() => db, {FieldValue: {}, Timestamp: {now: () => ({})}}), storage: () => ({})};
  const context = vm.createContext({document, firebase, console, URL, Event, Date, Map, Set, Promise,
    localStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)},
    sessionStorage: {getItem() {}, removeItem() {}, setItem() {}},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    window: {addEventListener() {}, removeEventListener() {}, open: () => null}, navigator: {}});
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, file] of html.matchAll(/<script src="(js\/[^"]+)"/g)) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
  context.toast = message => notices.push(message);
  return {context, style, elements, notices, db, run: code => vm.runInContext(code, context)};
}
test('All application scripts load together with no duplicate lexical declarations', () => {
  const c = client(); assert.equal(c.run('typeof openDutyTemplateModal'), 'function'); assert.equal(c.run('typeof checkAllUsers'), 'function');
});
test('Client and server task defaults agree, include only names and exclude removed options', () => {
  const c = client();
  const defaults = require('../duty-defaults.json');
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(DUTY_TASK_POOL)')), defaults.pool);
  assert.ok(defaults.pool.every(name => typeof name === 'string' && name.length > 0));
  c.run("state.factionsById.lsv = {id:'lsv', name:'LSV'}");
  const choices = c.run("taskCheckboxes('lsv', ['Проверить склад'])");
  assert.equal(choices.includes('Проверить склад'), false);
});
test('Guest cannot access application tabs and popup blocking resets the sign-in button', async () => {
  const c = client();
  assert.equal(c.run("canAccessTab('leaders')"), false);
  c.run('renderGuestScreen()'); assert.equal(c.elements.get('.shell').hidden, true);
  c.run('_profileChecking = true; renderGuestScreen()'); assert.equal(c.elements.get('guestLogin').disabled, true);
  c.run('_profileChecking = false');
  await c.run('login()'); assert.equal(c.elements.get('guestLogin').disabled, false);
  assert.match(c.elements.get('guestError').textContent, /всплывающие/);
});
test('Arbitrary hex theme changes the shared accent, presets clear custom overrides', () => {
  const c = client(); c.run("applyTheme('#126fed', true)");
  assert.equal(c.style.get('--violet'), '#126fed');
  c.run("applyTheme('red', true)"); assert.equal(c.style.has('--violet'), false);
  assert.equal(c.run('document.documentElement.dataset.theme'), 'red');
});
test('Realtime repeated snapshots generate one notification; a later revision generates another', () => {
  const c = client(); let callback;
  const query = {where: () => query, onSnapshot: fn => {callback = fn; return () => {};}};
  c.db.collection = () => query;
  c.run("state.user = {uid:'owner', active:true, systemRole:'curator_assistant', permissions:[]}; initGlobalSupportUnreadListener()");
  const snap = revision => ({forEach: fn => fn({id: 't', data: () => ({title: 'Помощь', userRevision: revision, userReadRevision: 0})})});
  callback(snap(1)); callback(snap(1));
  assert.equal(c.notices.length, 1);
  c.run('initGlobalSupportUnreadListener()'); callback(snap(1)); assert.equal(c.notices.length, 1);
  callback(snap(2)); assert.equal(c.notices.length, 2);
  assert.equal(c.elements.get('supportUnreadBadge').textContent, 1);
});
test('Duty name resolution uses a saved historical nickname instead of the Discord ID', () => {
  const c = client();
  assert.equal(c.run("dutyUserName('discord:123', {assigneeNames:{'discord:123':'Иван'}})"), 'Иван');
  assert.equal(c.run("dutyUserName('discord:123')").includes('123'), false);
});
