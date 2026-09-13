const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = vm.createContext({});
vm.runInContext(fs.readFileSync(`${__dirname}/../Providers.js`, 'utf8'), api);
const raw = fs.readFileSync(`${__dirname}/../providers.json`, 'utf8');
const catalog = api.catalog(raw);
const plain = value => JSON.parse(JSON.stringify(value));

test('bundled catalog validates; malformed or duplicated entries fail closed', () => {
  assert.equal(catalog.length, 2);
  assert.deepEqual(plain(api.catalog('invalid')), []);
  const duplicate = JSON.parse(raw); duplicate.providers[1].id = 'claude';
  assert.deepEqual(plain(api.catalog(JSON.stringify(duplicate))), []);
  const unsafe = JSON.parse(raw); unsafe.providers[0].icon = '../private.svg';
  assert.deepEqual(plain(api.catalog(JSON.stringify(unsafe))), []);
});
test('defaults preserve both bar summaries and costs, sanitizing unknown preferences', () => {
  const settings = api.normalize(catalog, {providerOrder:['unknown', 'codex', 'codex'], providers:{codex:{display:'invalid'}}});
  assert.deepEqual(plain(settings.providerOrder), ['codex','claude']);
  assert.deepEqual(plain(api.selected(catalog, settings, true, false)), ['codex','claude']);
  assert.equal(settings.showCosts, true);
});
test('panel-only continues collection; off removes it from collection and costs', () => {
  const settings = api.normalize(catalog, {providers:{claude:{display:'panel'},codex:{display:'off'}},showCosts:false});
  assert.deepEqual(plain(api.selected(catalog, settings, false, false)), ['claude']);
  assert.deepEqual(plain(api.selected(catalog, settings, true, false)), []);
  assert.deepEqual(plain(api.selected(catalog, settings, false, true)), ['claude']);
  assert.equal(settings.showCosts, false);
  settings.providers.claude.display='off';
  assert.deepEqual(plain(api.selected(catalog, settings, false, false)), []);
});
test('settings persistence retains unrelated native widget options', () => {
  const original={id:'headroom',enabled:true,monitor:'primary',custom:{value:4}};
  const config={bar:{layout:{center:[null, "omarchy.clock", original]}}};
  const found=api.entry(config,'headroom');
  const saved=api.mergedEntry(found,api.normalize(catalog,{}));
  assert.equal(saved.monitor,'primary');
  assert.equal(saved.custom.value,4);
  assert.equal(original.providerOrder,undefined);
  assert.deepEqual(plain(api.entry({},'headroom')),{});
});

test('oversized order settings fall back to the bounded catalog', () => {
  const settings=api.normalize(catalog,{providerOrder:Array(1000).fill('codex')});
  assert.deepEqual(plain(settings.providerOrder),['claude','codex']);
});

test('legacy visibility migrates and disabled providers retain their top-bar choice', () => {
  for (const mode of ['bar','panel','off']) {
    const saved = api.normalize(catalog, {providers:{claude:{display:mode}}});
    assert.equal(saved.providers.claude.display, mode);
    assert.equal(saved.providers.claude.showInBar, mode !== 'panel');
    assert.deepEqual(plain(api.normalize(catalog, plain(saved))), plain(saved));
  }
  const saved = api.normalize(catalog, {providers:{claude:{display:'off',showInBar:false}}});
  assert.equal(api.normalize(catalog, plain(saved)).providers.claude.showInBar, false);
  assert.deepEqual(plain(api.selected(catalog, saved, false, false)), ['codex']);
});

test('drag moves an ID without swapping other providers or changing preferences', () => {
  const initial={providerOrder:['a','hidden','b','c'],providers:{a:{display:'panel'},hidden:{display:'off'}},showCosts:false};
  const next=plain(api.reordered(initial,'a','c',true));
  assert.deepEqual(next.providerOrder,['hidden','b','c','a']);
  assert.deepEqual(next.providers,initial.providers);
  assert.equal(next.showCosts,false);
  assert.deepEqual(plain(api.reordered(next,'a','b',false)).providerOrder,['hidden','a','b','c']);
  assert.deepEqual(plain(api.reordered(initial,'unknown','a',false)),initial);
  assert.deepEqual(initial.providerOrder,['a','hidden','b','c']);
});

test('cost moves around providers without entering collection or losing its hidden position', () => {
  let prefs=api.normalize(catalog,{});
  assert.deepEqual(plain(api.panelOrder(prefs)),['cost','claude','codex']);
  prefs=api.reordered(prefs,'cost','claude',true);
  assert.deepEqual(plain(api.panelOrder(prefs)),['claude','cost','codex']);
  prefs=api.normalize(catalog,{...prefs,showCosts:false});
  assert.deepEqual(plain(api.panelOrder(prefs)),['claude','cost','codex']);
  assert.deepEqual(plain(api.selected(catalog,prefs,false,false)),['claude','codex']);
  prefs=api.reordered(prefs,'cost','codex',true);
  assert.deepEqual(plain(api.panelOrder(prefs)),['claude','codex','cost']);
  prefs=api.reordered(prefs,'cost','claude',false);
  assert.deepEqual(plain(api.panelOrder(prefs)),['cost','claude','codex']);
  assert.equal(api.normalize(catalog,{costPosition:99}).costPosition,2);
  // `omarchy bar set` stores '1' as a string; it is a position, not junk.
  assert.equal(api.normalize(catalog,{costPosition:'1'}).costPosition,1);
  assert.equal(api.normalize(catalog,{costPosition:'x'}).costPosition,0);
});

test('settings written by `omarchy bar set` arrive as strings', () => {
  // The CLI stores unquoted values as strings; the UI stores real types.
  const settings=api.normalize(catalog,{showCosts:'false',costPosition:'1',providers:{claude:{display:'off',showInBar:'false'}}});
  assert.equal(settings.showCosts,false);
  assert.equal(settings.costPosition,1);
  assert.equal(settings.providers.claude.showInBar,false);
  assert.equal(api.normalize(catalog,{showCosts:'true'}).showCosts,true);
  assert.equal(api.normalize(catalog,{showCosts:'maybe'}).showCosts,true);
});
