import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Cairo from 'cairo';
import Pango from 'gi://Pango';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Model from './Model.js';
import * as Pace from './Pace.js';
import * as Costs from './Costs.js';
import * as Providers from './Providers.js';
import {UsageService} from './UsageService.js';

function label(text = '', style_class = '') {
    return new St.Label({text, style_class, y_align: Clutter.ActorAlign.CENTER});
}
function wrap(widget) {
    widget.clutter_text.single_line_mode = false;
    widget.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    widget.clutter_text.line_wrap = true;
    return widget;
}
function button(text, action) {
    const widget = new St.Button({label: text, style_class: 'button headroom-button',
        can_focus: true, reactive: true});
    widget.connect('clicked', action);
    return widget;
}
function color(context, value, alpha = 1) {
    context.setSourceRGBA(value.red / 255, value.green / 255, value.blue / 255, alpha);
}

export default class Headroom extends Extension {
    enable() {
        this._active = true;
        this._period = 0;
        const [, bytes] = this.dir.get_child('providers.json').load_contents(null);
        this._catalog = Providers.catalog(new TextDecoder().decode(bytes));
        if (!this._catalog.length) throw new Error('Headroom: invalid bundled catalog');
        this._settings = this.getSettings();
        this._indicator = new PanelMenu.Button(0.0, 'Headroom', false);
        this._bar = new St.BoxLayout({style_class: 'headroom-bar'});
        this._indicator.add_child(this._bar);
        this._service = new UsageService(this.path, this._catalog, () => this._update());
        this._settingsId = this._settings.connect('changed', () => this._configure());
        this._indicator.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === 3 || event.get_button() === 2) {
                this._service.refresh();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._indicator.menu.connect('open-state-changed', () => this._update());
        try {
            this._configure();
            Main.panel.addToStatusArea(this.uuid, this._indicator);
        } catch (error) { this.disable(); throw error; }
    }

    _icon(definition, size = 14) {
        return new St.Icon({gicon: new Gio.FileIcon({file: this.dir.resolve_relative_path(
            `assets/${definition.icon.replace('.svg', '-symbolic.svg')}`)}),
        style_class: 'headroom-icon', icon_size: size});
    }

    _configure() {
        const raw = {providerOrder: this._settings.get_strv('provider-order'), providers: {},
            showCosts: this._settings.get_boolean('cost-enabled'),
            costPosition: this._settings.get_int('cost-position')};
        for (const p of this._catalog) {
            const enabled = this._settings.get_boolean(`${p.id}-enabled`);
            const bar = this._settings.get_boolean(`${p.id}-top-bar`);
            raw.providers[p.id] = {display: enabled ? (bar ? 'bar' : 'panel') : 'off', showInBar: bar};
        }
        this._preferences = Providers.normalize(this._catalog, raw);
        this._ids = Providers.selected(this._catalog, this._preferences, false, false);
        this._demo = this._settings.get_boolean('demo-mode');
        this._barWindows = Model.barWindows(this._settings.get_strv('bar-windows'));
        this._mode = Model.displayMode(this._settings.get_string('display-mode'));
        this._buildBar();
        this._buildMenu();
        this._service.configure(this._ids, raw.showCosts, this._demo);
    }

    _buildBar() {
        this._bar.destroy_all_children();
        this._barLabels = new Map();
        for (const id of Providers.selected(this._catalog, this._preferences, true, false)) {
            const p = Providers.find(this._catalog, id);
            const group = new St.BoxLayout({style_class: 'headroom-provider'});
            const value = label('—');
            group.add_child(this._icon(p));
            group.add_child(value);
            this._bar.add_child(group);
            this._barLabels.set(id, value);
        }
        if (!this._barLabels.size) this._bar.add_child(label('Headroom'));
        if (this._demo) this._bar.add_child(label('DEMO', 'headroom-demo'));
    }

    _section(scrollable = false) {
        const item = new PopupMenu.PopupMenuSection();
        const box = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'headroom-section'});
        if (scrollable) {
            const scroll = new St.ScrollView({overlay_scrollbars: true, x_expand: true,
                style_class: 'headroom-scroll'});
            scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            scroll.set_child(box);
            item.box.add_child(scroll);
        } else item.box.add_child(box);
        this._indicator.menu.addMenuItem(item);
        return box;
    }

    _buildMenu() {
        this._indicator.menu.removeAll();
        this._rows = [];
        this._headers = new Map();
        this._structure = '';
        this._body = this._section(true);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const footer = this._section();
        const line = new St.BoxLayout({style_class: 'headroom-footer'});
        const texts = new St.BoxLayout({vertical: true, x_expand: true});
        texts.add_child(label('Headroom', 'headroom-heading'));
        this._countdown = label('', 'headroom-muted');
        texts.add_child(this._countdown);
        line.add_child(texts);
        line.add_child(button('⚙', () => { this._indicator.menu.close(); this.openPreferences(); }));
        line.get_last_child().accessible_name = 'Settings';
        line.add_child(button('↻', () => this._service.refresh()));
        line.get_last_child().accessible_name = 'Refresh';
        footer.add_child(line);
    }

    _buildDetails() {
        this._body.destroy_all_children();
        this._rows = [];
        this._headers.clear();
        this._costUI = null;
        for (const id of Providers.panelOrder(this._preferences)) {
            if (id === 'cost') {
                if (this._preferences.showCosts) this._buildCosts();
                continue;
            }
            if (!this._ids.includes(id)) continue;
            const definition = Providers.find(this._catalog, id);
            const provider = this._service.usage.get(id) || Model.empty(id, definition.name);
            const section = new St.BoxLayout({vertical: true, style_class: 'headroom-group'});
            const heading = new St.BoxLayout({style_class: 'headroom-heading-row'});
            heading.add_child(this._icon(definition, 18));
            heading.add_child(label(definition.name, 'headroom-heading'));
            const plan = label('', 'headroom-muted');
            plan.x_expand = true;
            plan.x_align = Clutter.ActorAlign.END;
            heading.add_child(plan);
            section.add_child(heading);
            const status = label('', 'headroom-muted');
            wrap(status);
            section.add_child(status);
            this._headers.set(id, {plan, status});
            for (const window of provider.windows) {
                const row = new St.BoxLayout({vertical: true, style_class: 'headroom-quota'});
                const titleRow = new St.BoxLayout({style_class: 'headroom-heading-row'});
                titleRow.add_child(label(window.title));
                const warning = label('', 'headroom-warning');
                warning.x_expand = true;
                warning.x_align = Clutter.ActorAlign.END;
                titleRow.add_child(warning);
                row.add_child(titleRow);
                const meter = new St.DrawingArea({height: 6, x_expand: true});
                const info = {id, windowId: window.id, warning, meter, window: null, fresh: false};
                meter.connect('repaint', () => this._paintMeter(info));
                row.add_child(meter);
                const numbers = new St.BoxLayout();
                info.reset = label('', 'headroom-muted');
                info.reset.x_expand = true;
                info.value = label('—');
                numbers.add_child(info.reset);
                numbers.add_child(info.value);
                row.add_child(numbers);
                this._rows.push(info);
                section.add_child(row);
            }
            this._body.add_child(section);
        }
        if (!this._ids.length && !this._preferences.showCosts)
            this._body.add_child(label('Enable a provider in Settings.', 'headroom-muted'));
    }

    _buildCosts() {
        const section = new St.BoxLayout({vertical: true, style_class: 'headroom-group'});
        section.add_child(label('Cost', 'headroom-heading'));
        const explanation = label('Estimated API-equivalent value of local usage, in USD.\nNot subscription charges.', 'headroom-muted');
        wrap(explanation);
        section.add_child(explanation);
        const periods = new St.BoxLayout({style_class: 'headroom-periods'});
        const choices = ['Today', 'Yesterday', '30 Days'].map((text, index) => {
            const item = button(text, () => { this._period = index; this._update(); });
            item.x_expand = true;
            periods.add_child(item);
            return item;
        });
        section.add_child(periods);
        const data = new St.BoxLayout({style_class: 'headroom-cost-data'});
        const ring = new St.DrawingArea({width: 134, height: 134});
        ring.connect('repaint', () => this._paintRing());
        data.add_child(ring);
        const legend = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER,
            x_expand: true, style_class: 'headroom-legend'});
        const amounts = new Map();
        for (const id of this._ids) {
            const definition = Providers.find(this._catalog, id);
            const row = new St.BoxLayout({style_class: 'headroom-heading-row'});
            const dot = label('●');
            dot.set_style(`color: ${definition.color};`);
            row.add_child(dot);
            const name = label(definition.shortName);
            name.x_expand = true;
            row.add_child(name);
            const value = label('—');
            row.add_child(value);
            legend.add_child(row);
            amounts.set(id, value);
        }
        data.add_child(legend);
        section.add_child(data);
        const status = label('', 'headroom-muted');
        wrap(status);
        section.add_child(status);
        this._body.add_child(section);
        this._costUI = {ring, status, amounts, choices};
    }

    _costDocument() {
        const entries = this._ids.map(id => this._service.cost.get(id) ||
            {id, state: 'loading', daily: {}, observedAt: 0, message: 'Reading local usage…'});
        return {providers: entries};
    }

    _update() {
        if (!this._active || !this._countdown) return;
        const now = Date.now();
        for (const [id, value] of this._barLabels) {
            const provider = this._service.usage.get(id);
            const fresh = Model.fresh(provider, now);
            value.text = Model.barText(provider, this._barWindows, now, this._mode, window => {
                if (!fresh) return ' !';
                const pace = Pace.evaluate(window, provider?.observedAt, now, fresh);
                return pace && ['urgent', 'exhausted'].includes(pace.status) ? ' 🔥' : '';
            });
        }
        this._countdown.text = this._service.footer();
        const structure = JSON.stringify(this._ids.map(id => [id,
            (this._service.usage.get(id)?.windows || []).map(w => [w.id, w.title])]));
        if (structure !== this._structure) { this._structure = structure; this._buildDetails(); }
        for (const [id, header] of this._headers) {
            const provider = this._service.usage.get(id) || Model.empty(id);
            header.plan.text = provider.plan;
            header.status.text = Model.message(provider, now);
            header.status.visible = Boolean(header.status.text);
        }
        for (const row of this._rows) {
            const provider = this._service.usage.get(row.id);
            row.window = Model.find(provider, row.windowId);
            row.fresh = Model.fresh(provider, now);
            row.pace = Pace.evaluate(row.window, provider?.observedAt, now, row.fresh);
            const percent = Model.percentage(row.window, now, this._mode);
            row.value.text = percent === '—' ? percent : `${percent} ${this._mode === 'used' ? 'used' : 'left'}`;
            row.reset.text = row.window?.resetAt > 0 ? `Resets ${Pace.duration(row.window.resetAt - now)}` : 'Reset time unavailable';
            const note = Pace.summary(row.pace, now);
            row.warning.text = row.pace && row.pace.status !== 'calm' ?
                `${row.pace.status === 'caution' ? '⌛' : '🔥'} ${note}`.trim() : '';
            row.meter.accessible_name = Pace.tooltip(row.pace) || row.value.text;
            if (this._indicator.menu.isOpen) row.meter.queue_repaint();
        }
        if (this._costUI) {
            const doc = this._costDocument();
            for (const [id, value] of this._costUI.amounts) {
                const amount = Costs.amount(doc, id, this._period, now);
                value.text = amount === null ? '—' : `$${amount.toFixed(2)}`;
            }
            this._costUI.status.text = this._ids.length ? Costs.message(doc, now) : 'Enable a provider for cost estimates.';
            this._costUI.status.visible = this._costUI.status.text !== 'Estimated local usage · USD';
            this._costUI.choices.forEach((choice, index) => {
                if (index === this._period) choice.add_style_pseudo_class('checked');
                else choice.remove_style_pseudo_class('checked');
            });
            if (this._indicator.menu.isOpen) this._costUI.ring.queue_repaint();
        }
    }

    _paintMeter(row) {
        const context = row.meter.get_context();
        const [width, height] = row.meter.get_surface_size();
        const fg = row.meter.get_theme_node().get_foreground_color();
        color(context, fg, 0.16);
        context.rectangle(0, 0, width, height);
        context.fill();
        if (row.window && Model.percentage(row.window, Date.now()) !== '—') {
            const severity = Pace.severity(row.window, row.pace, Date.now(), row.fresh);
            if (severity === 'critical') context.setSourceRGBA(0.9, 0.24, 0.2, 1);
            else if (severity === 'warning') context.setSourceRGBA(0.77, 0.6, 0.09, 1);
            else color(context, fg, row.fresh ? 0.85 : 0.4);
            context.rectangle(0, 0, width * Model.meterFill(row.window, this._mode), height);
            context.fill();
            const marker = Pace.marker(row.pace);
            if (marker !== null) {
                color(context, fg);
                // The marker is the elapsed share of the window; in remaining mode
                // it counts down from the right, in used mode up from the left.
                context.rectangle(width * (this._mode === 'used' ? marker : 1 - marker), 0, 1, height);
                context.fill();
            }
        }
        context.$dispose();
    }

    _paintRing() {
        if (!this._costUI) return;
        const context = this._costUI.ring.get_context();
        const [width, height] = this._costUI.ring.get_surface_size();
        const fg = this._costUI.ring.get_theme_node().get_foreground_color();
        const doc = this._costDocument();
        const now = Date.now(), total = Costs.total(doc, this._period, now);
        const radius = Math.min(width, height) / 2 - 13;
        context.setLineWidth(22);
        color(context, fg, 0.13);
        context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
        context.stroke();
        let angle = -Math.PI / 2;
        if (total > 0) for (const id of this._ids) {
            const amount = Costs.amount(doc, id, this._period, now);
            if (!amount) continue;
            const hex = Providers.find(this._catalog, id).color;
            context.setSourceRGB(parseInt(hex.slice(1, 3), 16) / 255,
                parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
            const end = angle + amount / total * Math.PI * 2;
            context.arc(width / 2, height / 2, radius, angle, end);
            context.stroke();
            angle = end;
        }
        color(context, fg);
        context.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        context.setFontSize(22);
        const text = total === null ? '—' : `$${Math.round(total)}`;
        const extents = context.textExtents(text);
        context.moveTo((width - extents.width) / 2 - extents.xBearing, (height - extents.height) / 2 - extents.yBearing);
        context.showText(text);
        context.$dispose();
    }

    disable() {
        this._active = false;
        if (this._settingsId) this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        this._service?.destroy();
        this._service = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
