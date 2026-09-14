const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const model = vm.createContext({});
vm.runInContext(readFileSync(new URL('../Model.js', `file://${__filename}`), 'utf8'), model);
const hour = 3600000, now = 1900000000000;
const win = (id, used, durationMs) => ({id, title: id, used, durationMs, resetAt: now + hour});
const provider = {id: 'claude', state: 'fresh', observedAt: now,
  windows: [win('session', .26, 5 * hour), win('weekly', .39, 168 * hour)]};
const plain = value => JSON.parse(JSON.stringify(value));

test('bar window choice keeps known IDs in display order and never goes empty', () => {
  assert.deepEqual(plain(model.barWindows(['weekly'])), ['weekly']);
  assert.deepEqual(plain(model.barWindows(['weekly', 'session'])), ['session', 'weekly']);
  assert.deepEqual(plain(model.barWindows(['session', 'bogus', 'session'])), ['session']);
  assert.deepEqual(plain(model.barWindows([])), ['weekly']);
  assert.deepEqual(plain(model.barWindows('weekly')), ['weekly']);
});
test('short titles come from the duration, not the provider wording', () => {
  assert.equal(model.shortTitle(win('session', 0, 5 * hour)), '5h');
  assert.equal(model.shortTitle(win('weekly', 0, 168 * hour)), '7d');
  assert.equal(model.shortTitle(win('session', 0, 1.5 * hour)), '90m');
  assert.equal(model.shortTitle(win('session', 0, .5 * hour)), '30m');
  assert.equal(model.shortTitle({id: 'x', title: 'Custom', used: 0}), 'Custom');
  assert.equal(model.shortTitle(null), '');
});
test('bar text keeps a single window plain and labels several', () => {
  assert.equal(model.barText(provider, ['weekly'], now), '61%');
  assert.equal(model.barText(provider, ['session'], now), '74%');
  assert.equal(model.barText(provider, ['session', 'weekly'], now), '5h 74% · 7d 61%');
});
test('bar text skips missing windows, dashes when none, and decorates per window', () => {
  assert.equal(model.barText(provider, ['session', 'missing'], now), '74%');
  assert.equal(model.barText(provider, ['missing'], now), '—');
  assert.equal(model.barText(null, ['weekly'], now), '—');
  assert.equal(model.barText(provider, [], now), '—');
  const flame = w => (w.id === 'session' ? ' 🔥' : '');
  assert.equal(model.barText(provider, ['session', 'weekly'], now, flame), '5h 74% 🔥 · 7d 61%');
});
