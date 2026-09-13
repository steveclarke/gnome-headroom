const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const pace = vm.createContext({});
vm.runInContext(readFileSync(new URL('../Pace.js', `file://${__filename}`), 'utf8'), pace);
const model = vm.createContext({});
vm.runInContext(readFileSync(new URL('../Model.js', `file://${__filename}`), 'utf8'), model);
const hour = 3600000, now = 1900000000000;
const window = (used, elapsed = hour) => ({used, durationMs: 5 * hour, resetAt: now + 5 * hour - elapsed});
test('40% in an hour projects 90 minutes to exhaustion', () => {
  const result = pace.evaluate(window(.4), now, now, true);
  assert.equal(result.status, 'urgent');
  assert.equal(result.projected, 2);
  assert.equal(result.exhaustionAt, now + 1.5 * hour);
});
test('20% after two hours leaves half the allowance at reset', () => {
  const result = pace.evaluate(window(.2, 2 * hour), now, now, true);
  assert.equal(result.status, 'calm');
  assert.equal(result.spare, .5);
});
test('countdown ticks cannot change the sampled burn rate', () => {
  const a = pace.evaluate(window(.4), now, now, true);
  const b = pace.evaluate(window(.4), now, now + 60000, true);
  assert.equal(a.exhaustionAt, b.exhaustionAt);
  assert.equal(a.projected, b.projected);
  assert.notEqual(pace.summary(a, now), pace.summary(b, now + 60000));
});
test('no predictions from zero, early, unknown, stale, future, or invalid input', () => {
  for (const w of [window(0), window(.1, 1000), {...window(.4), durationMs: 0}, window(NaN), window(null)])
    assert.equal(pace.evaluate(w, now, now, true), null);
  assert.equal(pace.evaluate(window(.4), now, now, false), null);
  assert.equal(pace.evaluate(window(.4), now, now + 600001, true), null);
  assert.equal(pace.evaluate(window(.4), now + 10000, now, true), null);
  assert.equal(pace.evaluate({...window(.4), resetAt: now}, now, now, true), null);
});
test('boundaries distinguish caution, no buffer and exhausted', () => {
  assert.equal(pace.evaluate(window(.18), now, now, true).status, 'calm');
  assert.equal(pace.evaluate(window(.19), now, now, true).status, 'caution');
  const exact = pace.evaluate(window(.2), now, now, true);
  assert.equal(exact.status, 'urgent');
  assert.equal(exact.exhaustionAt, null);
  assert.equal(pace.evaluate(window(1), now, now, true).status, 'exhausted');
  assert.equal(pace.summary(pace.evaluate(window(.199), now, now, true), now), '~1% spare');
});
test('healthy pacing is blue and quiet, with its buffer available only on hover', () => {
  const w = window(.2, 2 * hour), result = pace.evaluate(w, now, now, true);
  assert.equal(pace.summary(result, now), '');
  assert.equal(pace.marker(result), null);
  assert.equal(pace.severity(w, result, now, true), 'normal');
  assert.match(pace.tooltip(result), /^~50% left at reset/);
});
test('low buffer gets a yellow meter, spare note and even-pace tick', () => {
  const w = window(.485, 2.5 * hour), result = pace.evaluate(w, now, now, true);
  assert.equal(pace.summary(result, now), '~3% spare');
  assert.equal(pace.marker(result), .5);
  assert.equal(pace.severity(w, result, now, true), 'warning');
  assert.match(pace.tooltip(result), /^~97% used at reset/);
});
test('rounding to zero spare is a red flame without an invented ETA or zero-spare note', () => {
  const w = window(.1995), result = pace.evaluate(w, now, now, true);
  assert.equal(result.status, 'urgent');
  assert.equal(result.exhaustionAt, null);
  assert.equal(pace.summary(result, now), '');
  assert.equal(pace.severity(w, result, now, true), 'critical');
  assert.equal(pace.marker(result), .2);
});
test('near-empty coarse readings cannot create a premature warning', () => {
  for (const used of [.01, .04]) {
    const w = window(used, 5 * hour * .01);
    assert.equal(pace.evaluate(w, now, now, true), null);
    assert.equal(pace.severity(w, null, now, true), 'normal');
  }
});
test('a displayed zero is spent; unknown durations use level colors without forecasts', () => {
  const spent = {...window(.996), resetAt: 0};
  const result = pace.evaluate(spent, now, now, true);
  assert.equal(result.status, 'exhausted');
  assert.equal(pace.summary(result, now), 'Limit reached');
  assert.equal(pace.marker(result), null);
  for (const [used, expected] of [[.79, 'normal'], [.8, 'warning'], [.9, 'critical']]) {
    const w = {...window(used), durationMs: 0};
    assert.equal(pace.evaluate(w, now, now, true), null);
    assert.equal(pace.summary(null, now), '');
    assert.equal(pace.severity(w, null, now, true), expected);
  }
  assert.equal(pace.severity(window(.9), null, now, false), 'normal');
  assert.equal(pace.severity({...window(.9), resetAt: now}, null, now, true), 'none');
});
test('failed refresh keeps values but removes freshness', () => {
  const old = {state:'fresh', windows:[window(.4)], observedAt:now, plan:'Pro'};
  const result = model.merge(old, {state:'unavailable', windows:[], observedAt:0});
  assert.equal(result.windows.length, 1);
  assert.equal(model.fresh(result, now), false);
});
test('missing and reset values never read as a full allowance', () => {
  assert.equal(model.percentage(null, now), '—');
  assert.equal(model.percentage({...window(.4), resetAt:now}, now), '—');
});

test('refresh footer follows enabled worker deadlines and refresh completion', () => {
  const service={demoMode:'',refreshing:false,costsRefreshing:false,selectedIds:['claude'],costIds:['claude'],nextRefreshAt:now+300000,nextCostRefreshAt:now+120000};
  assert.equal(model.refreshLabel(service,now),'Next update in 2 min');
  assert.equal(model.refreshLabel(service,now+61000),'Next update in <1 min');
  assert.equal(model.refreshLabel({...service,costIds:[]},now),'Next update in 5 min');
  assert.equal(model.refreshLabel({...service,refreshing:true},now),'Updating…');
  assert.equal(model.refreshLabel({...service,costsRefreshing:true},now),'Updating…');
  assert.equal(model.refreshLabel({...service,nextCostRefreshAt:now+300000},now),'Next update in 5 min');
  assert.equal(model.refreshLabel(service,now+120000),'Next update soon');
  assert.equal(model.refreshLabel({...service,selectedIds:[],costIds:[]},now),'Updates paused');
  assert.equal(model.refreshLabel({...service,demoMode:'normal'},now),'Sample data');
});
