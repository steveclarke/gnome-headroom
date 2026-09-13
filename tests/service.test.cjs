const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const path = require('node:path');

function harness() {
  const timers = new Map(), processes = [];
  let next = 0;
  const GLib = {PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true, SOURCE_REMOVE: false,
    get_home_dir: () => '/nonexistent',
    timeout_add_seconds: (_priority, _seconds, callback) => { timers.set(++next, callback); return next; },
    Source: {remove: id => { timers.delete(id); }}};
  const Gio = {SubprocessFlags: {STDOUT_PIPE: 1, STDERR_SILENCE: 2},
    SubprocessLauncher: class {
      setenv() {}
      spawnv() {
        const process = {killed: false,
          force_exit() { this.killed = true; },
          communicate_utf8_async(_input, _cancel, callback) { this.callback = callback; },
          communicate_utf8_finish() { return [true, this.output]; },
          get_successful() { return true; },
          finish(output) { this.output = output; this.callback(this, {}); }};
        processes.push(process);
        return process;
      }
    }};
  const scope = vm.createContext({Gio, GLib});
  for (const name of ['Model', 'Costs', 'Wire']) {
    scope[name] = vm.createContext({});
    vm.runInContext(readFileSync(path.join(__dirname, '..', name + '.js'), 'utf8'), scope[name]);
  }
  const source = readFileSync(path.join(__dirname, '../gnome/UsageService.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export class UsageService', 'class UsageService');
  vm.runInContext(source + '\nthis.Service = UsageService;', scope);
  let updates = 0;
  const service = new scope.Service('/nonexistent', [{id: 'claude', name: 'Claude Code'}], () => updates++);
  return {service, processes, timers, updates: () => updates};
}

test('refresh during a running collection does not queue a second collection', () => {
  const h = harness();
  h.service.configure(['claude'], false, false);
  const deadline = h.service.deadlines.get('usage:claude');
  h.service.refresh();
  assert.equal(h.service.deadlines.get('usage:claude'), deadline);
  h.processes[0].finish('invalid report');
  h.service.tick();
  assert.equal(h.processes.length, 1);
  assert.equal(h.service.usage.get('claude').state, 'unavailable');
  h.service.destroy();
});

test('disable kills pending quota and cost workers and ignores late callbacks', () => {
  const h = harness();
  h.service.configure(['claude'], true, false);
  assert.equal(h.processes.length, 2);
  h.service.destroy();
  const updates = h.updates();
  for (const p of h.processes) { assert.equal(p.killed, true); p.finish('invalid report'); }
  assert.equal(h.timers.size, 0);
  assert.equal(h.service.jobs.size, 0);
  assert.equal(h.service.usage.size, 0);
  assert.equal(h.updates(), updates);
});

test('turning off a provider cancels its work and removes its deadlines', () => {
  const h = harness();
  h.service.configure(['claude'], true, false);
  h.service.configure([], false, false);
  assert.equal(h.service.jobs.size, 0);
  assert.equal(h.service.deadlines.size, 0);
  assert.ok(h.processes.every(p => p.killed));
  assert.equal(h.service.footer(), 'Updates paused');
  h.service.destroy();
});
