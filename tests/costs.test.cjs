const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const costs = vm.createContext({});
vm.runInContext(readFileSync(new URL('../Costs.js', `file://${__filename}`), 'utf8'), costs);
const now = new Date(2030, 0, 1, 12).getTime();

test('calendar periods include today plus 29 previous days across a year boundary', () => {
  const doc = costs.demo(now, 'normal');
  doc.providers[0].daily[costs.dayKey(now, -29)] = 5;
  doc.providers[0].daily[costs.dayKey(now, -30)] = 9999;
  assert.equal(costs.amount(doc, "claude", 0, now), 84.2);
  assert.equal(costs.amount(doc, "claude", 1, now), 62.1);
  assert.ok(Math.abs(costs.amount(doc, "claude", 2, now) - 892.1) < 1e-9);
  assert.equal(costs.dayKey(now, -1), '2029-12-31');
});

test('an unavailable provider remains unavailable, without inventing a combined total', () => {
  const doc = costs.demo(now, 'normal');
  doc.providers[1].state = 'unavailable';
  assert.equal(costs.total(doc, 0, now), null);
  assert.equal(costs.amount(doc, "codex", 0, now), null);
  assert.equal(costs.amount(doc, "claude", 0, now), 84.2);
  assert.equal(costs.amount(costs.empty(), "claude", 0, now), null);
});

test('fresh empty daily data is zero; yesterday data cannot impersonate today after midnight', () => {
  const doc = costs.demo(now, 'normal');
  doc.providers[0].daily = {};
  assert.equal(costs.amount(doc, "claude", 0, now), 0);
  assert.equal(costs.amount(doc, "claude", 0, now + 600001), null);
  const midnight = new Date(2030, 0, 2).getTime();
  doc.observedAt = midnight - 1000;
  assert.equal(costs.amount(doc, "claude", 0, midnight + 1000), null);
});

test('local calendar stepping survives a DST transition without dropping a day', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/St_Johns';
  try {
    const after = new Date(2030, 2, 11, 0, 15).getTime();
    assert.equal(costs.dayKey(after, -1), '2030-03-10');
    assert.equal(costs.dayKey(after, -2), '2030-03-09');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('future observations fail closed after a clock rollback', () => {
  const now = new Date(2030, 0, 1, 10).getTime()
  const doc = costs.demo(now + 7200000, 'normal')
  assert.equal(costs.amount(doc, "claude", 0, now), null)
})


test('partial reports keep available amounts visible for all three periods', () => {
  const doc = costs.demo(now, 'normal');
  const expected = [0, 1, 2].map(period => ({
    a: costs.amount(doc, "claude", period, now),
    b: costs.amount(doc, "codex", period, now),
    total: costs.total(doc, period, now)
  }));
  for (const states of [['fresh', 'partial'], ['partial', 'partial']]) {
    doc.providers.forEach((p, i) => { p.state = states[i]; });
    for (let period = 0; period < 3; period++) {
      assert.equal(costs.amount(doc, "claude", period, now), expected[period].a);
      assert.equal(costs.amount(doc, "codex", period, now), expected[period].b);
      assert.equal(costs.total(doc, period, now), expected[period].total);
    }
    assert.equal(costs.message(doc, now), 'Partial estimate · some usage may be missing');
  }
});

test('partial reports still expire and cannot survive a clock rollback', () => {
  const doc = costs.demo(now, 'normal');
  doc.providers[0].state = 'partial';
  for (const clock of [now + 600001, now - 6000, new Date(2030, 0, 2).getTime()]) {
    assert.equal(costs.total(doc, 0, clock), null);
    assert.equal(costs.message(doc, clock), 'Costs outdated · refresh to update');
  }
  doc.providers[1].state = 'unavailable';
  doc.providers[1].message = 'Local costs unavailable';
  assert.equal(costs.message(doc, now), 'Local costs unavailable');
});


test('costs follow IDs across reordering and a single provider can stand alone', () => {
  const doc = costs.demo(now, 'normal');
  const claude = costs.amount(doc, 'claude', 0, now);
  const codex = costs.amount(doc, 'codex', 0, now);
  doc.providers.reverse();
  assert.equal(costs.amount(doc, 'claude', 0, now), claude);
  assert.equal(costs.amount(doc, 'codex', 0, now), codex);
  doc.providers = doc.providers.filter(p => p.id === 'codex');
  assert.equal(costs.total(doc, 0, now), codex);
  assert.equal(costs.amount(doc, 'claude', 0, now), null);
  assert.equal(costs.total(costs.empty([]), 0, now), null);
});
