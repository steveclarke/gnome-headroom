const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const wire = vm.createContext({})
vm.runInContext(fs.readFileSync(`${__dirname}/../Wire.js`, 'utf8'), wire)
const parse = (raw, costs, ids = ['claude', 'codex']) => wire.parse(raw, costs, ids)
const report = () => ({schema: 1, observedAt: 100, providers: ['claude', 'codex'].map(id => ({id, message: '', state: 'fresh', daily: {'2030-01-01': 2}}))})

test('accepts complete costs and rejects malformed boundaries atomically', () => {
  assert.equal(parse(JSON.stringify(report()), true).providers.length, 2)
  for (const mutate of [d => d.providers[1].id = 'claude', d => d.providers[0].daily = [],
    d => d.providers[0].daily.constructor = 10, d => d.providers[0].daily['2030-01-01'] = '2',
    d => d.providers[0].message = 'x'.repeat(161), d => d.providers[0].message = '\u202eunsafe',
    d => d.providers[0].daily['2030-01-01'] = -1]) {
    const doc = report(); mutate(doc)
    assert.throws(() => parse(JSON.stringify(doc), true))
  }
})
test('bounds bytes and nesting before decoding', () => {
  assert.throws(() => parse(' '.repeat(131073), true))
  assert.throws(() => parse('['.repeat(13) + '0' + ']'.repeat(13), true))
  const doc = report(); doc.providers[0].message = '[{\\"quoted"}]'
  assert.equal(parse(JSON.stringify(doc), true).providers.length, 2)
})
test('usage schema validates every window before use', () => {
  const doc = report()
  doc.providers.forEach(p => Object.assign(p, {name:p.id, plan:'', observedAt:100,
    windows:[{id:'weekly', title:'Weekly', used:.5, resetAt:1000, durationMs:604800000}]}))
  assert.equal(parse(JSON.stringify(doc), false).providers.length, 2)
  doc.providers[1].windows[0].used = null
  assert.throws(() => parse(JSON.stringify(doc), false))
})

test('reports must match the requested provider set, independent of order', () => {
  const doc = report(); doc.providers.reverse();
  assert.equal(parse(JSON.stringify(doc), true).providers[0].id, 'codex');
  assert.throws(() => parse(JSON.stringify(doc), true, ['claude']));
  doc.providers = doc.providers.filter(p => p.id === 'codex');
  assert.equal(parse(JSON.stringify(doc), true, ['codex']).providers.length, 1);
  assert.throws(() => parse(JSON.stringify(doc), true, ['claude']));
  assert.throws(() => parse(JSON.stringify(doc), true, []));
  doc.providers = [];
  assert.equal(parse(JSON.stringify(doc), true, []).providers.length, 0);
});
