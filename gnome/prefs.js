import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HeadroomPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Headroom', icon_name: 'view-list-symbolic'});
        const providers = new Adw.PreferencesGroup({title: 'Providers',
            description: 'Enabled providers collect usage and appear in details. Top bar adds their percentage.'});
        const rows = new Map();
        const names = {claude: 'Claude Code', codex: 'Codex'};
        const connections = [];
        const order = () => [...new Set(settings.get_strv('provider-order').filter(id => id in names).concat(Object.keys(names)))];
        for (const id of Object.keys(names)) {
            const row = new Adw.ExpanderRow({title: names[id]});
            const enabled = new Adw.SwitchRow({title: 'Enabled'});
            settings.bind(`${id}-enabled`, enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
            row.add_row(enabled);
            const bar = new Adw.SwitchRow({title: 'Top bar'});
            settings.bind(`${id}-top-bar`, bar, 'active', Gio.SettingsBindFlags.DEFAULT);
            settings.bind(`${id}-enabled`, bar, 'sensitive', Gio.SettingsBindFlags.GET);
            row.add_row(bar);
            const choices = ['default', 'remaining', 'used'];
            const show = new Adw.ComboRow({title: 'Show', subtitle: 'Follow the Display setting, or pick one for this provider.',
                model: Gtk.StringList.new(['Same as Display', 'Remaining', 'Used'])});
            show.selected = Math.max(0, choices.indexOf(settings.get_string(`${id}-display-mode`)));
            show.connect('notify::selected', () => {
                if (show.selected < choices.length) settings.set_string(`${id}-display-mode`, choices[show.selected]);
            });
            connections.push(settings.connect(`changed::${id}-display-mode`, () => {
                show.selected = Math.max(0, choices.indexOf(settings.get_string(`${id}-display-mode`)));
            }));
            settings.bind(`${id}-enabled`, show, 'sensitive', Gio.SettingsBindFlags.GET);
            row.add_row(show);
            const up = new Gtk.Button({icon_name: 'go-up-symbolic', valign: Gtk.Align.CENTER,
                tooltip_text: `Move ${names[id]} up`});
            const down = new Gtk.Button({icon_name: 'go-down-symbolic', valign: Gtk.Align.CENTER,
                tooltip_text: `Move ${names[id]} down`});
            for (const [button, delta] of [[up, -1], [down, 1]]) {
                button.connect('clicked', () => {
                    const next = order(), index = next.indexOf(id), target = index + delta;
                    if (target < 0 || target >= next.length) return;
                    [next[index], next[target]] = [next[target], next[index]];
                    settings.set_strv('provider-order', next);
                });
                row.add_suffix(button);
            }
            rows.set(id, {row, up, down});
        }
        let mounted = false;
        const reorder = () => {
            if (mounted) for (const {row} of rows.values()) providers.remove(row);
            order().forEach((id, index, ids) => {
                const {row, up, down} = rows.get(id);
                up.sensitive = index > 0;
                down.sensitive = index < ids.length - 1;
                providers.add(row);
            });
            mounted = true;
        };
        reorder();
        connections.push(settings.connect('changed::provider-order', reorder));
        page.add(providers);
        const display = new Adw.PreferencesGroup({title: 'Display',
            description: 'Show each quota as the headroom still left, or as the share already used. Each provider can override this under Providers.'});
        const modes = ['remaining', 'used'];
        const mode = new Adw.ComboRow({title: 'Show', model: Gtk.StringList.new(['Remaining', 'Used'])});
        mode.selected = Math.max(0, modes.indexOf(settings.get_string('display-mode')));
        mode.connect('notify::selected', () => {
            if (mode.selected < modes.length) settings.set_string('display-mode', modes[mode.selected]);
        });
        connections.push(settings.connect('changed::display-mode', () => {
            mode.selected = Math.max(0, modes.indexOf(settings.get_string('display-mode')));
        }));
        display.add(mode);
        page.add(display);
        const bar = new Adw.PreferencesGroup({title: 'Top bar',
            description: 'Quota windows shown next to each provider icon. With both on, the bar reads "5h 74% · 7d 61%".'});
        const windows = {session: ['5-hour window', 'Session quota, resets every five hours.'],
            weekly: ['Weekly window', 'Seven-day quota. The default headline.']};
        const chosen = () => settings.get_strv('bar-windows');
        for (const [id, [title, subtitle]] of Object.entries(windows)) {
            const row = new Adw.SwitchRow({title, subtitle, active: chosen().includes(id)});
            row.connect('notify::active', () => {
                const next = chosen().filter(item => item !== id);
                if (row.active) next.push(id);
                if (next.length) settings.set_strv('bar-windows', next);
                else row.active = true;
            });
            connections.push(settings.connect('changed::bar-windows', () => { row.active = chosen().includes(id); }));
            bar.add(row);
        }
        page.add(bar);
        const costs = new Adw.PreferencesGroup({title: 'Cost estimates',
            description: 'Estimated value of local usage in USD. Optional cost reader setup is required for live estimates.'});
        const enabled = new Adw.SwitchRow({title: 'Show costs'});
        settings.bind('cost-enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        costs.add(enabled);
        const position = new Adw.ComboRow({title: 'Position', model: Gtk.StringList.new([
            'Above providers', 'Between providers', 'Below providers'])});
        position.selected = settings.get_int('cost-position');
        position.connect('notify::selected', () => {
            if (position.selected < 3) settings.set_int('cost-position', position.selected);
        });
        connections.push(settings.connect('changed::cost-position', () => { position.selected = settings.get_int('cost-position'); }));
        costs.add(position);
        page.add(costs);
        const preview = new Adw.PreferencesGroup({title: 'Preview'});
        const demo = new Adw.SwitchRow({title: 'Use sample data',
            subtitle: 'Stops live collectors and shows synthetic values for screenshots.'});
        settings.bind('demo-mode', demo, 'active', Gio.SettingsBindFlags.DEFAULT);
        preview.add(demo);
        page.add(preview);
        window.add(page);
        window.set_default_size(560, 660);
        window.connect('close-request', () => {
            for (const id of connections) settings.disconnect(id);
            return false;
        });
    }
}
