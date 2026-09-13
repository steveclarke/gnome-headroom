import GLib from 'gi://GLib';
if (ARGV.length !== 1) throw new Error('Usage: gjs -m service-smoke.js /path/to/installed/extension');
const {UsageService} = await import(`file://${ARGV[0]}/UsageService.js`);
const loop = new GLib.MainLoop(null, false);
const catalog = [{id:'claude',name:'Claude Code'}, {id:'codex',name:'Codex'}];
let service, complete = false;
service = new UsageService(ARGV[0], catalog, () => {
    if (!service || service.jobs.size || service.usage.size !== 2) return;
    const states = [...service.usage.values()].map(p => ({id:p.id,state:p.state,windows:p.windows.length}));
    print(JSON.stringify(states));
    complete = states.every(p => p.state === 'fresh');
    service.destroy();
    loop.quit();
});
service.configure(['claude','codex'], false, false);
const deadline = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 75, () => {
    service.destroy(); loop.quit(); return GLib.SOURCE_REMOVE;
});
loop.run();
GLib.Source.remove(deadline);
if (!complete) throw new Error('Fresh service reports were not received');
print('PASS: GJS service collected fresh reports and disposed its workers/timer');
