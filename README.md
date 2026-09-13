# Headroom for GNOME Shell

Claude Code and Codex quotas in your Ubuntu top bar, with reset countdowns,
forecasts, and optional local cost estimates. Built for **Ubuntu 24.04 / GNOME 46**.
Other GNOME versions are not supported by this release.

![Dark popup showing sample data](screenshots/details-dark.png)
![Light popup showing sample data](screenshots/details-light.png)

## Install

1. Install the desktop tools and Python:

   ```sh
   sudo apt install gnome-shell-extension-prefs python3
   gnome-shell --version
   ```

   The version must be 46.x. Use the account that runs your GNOME desktop.

2. Download `headroom@steveclarke.github.io.zip` from the
   [latest release](https://github.com/steveclarke/gnome-headroom/releases/latest).
   Keep it as a ZIP, then run:

   ```sh
   gnome-extensions install --force ~/Downloads/headroom@steveclarke.github.io.zip
   ```

3. Log out of Ubuntu and log back in. Open a terminal and enable Headroom:

   ```sh
   gnome-extensions enable headroom@steveclarke.github.io
   gnome-extensions info headroom@steveclarke.github.io
   ```

   The status should say `ACTIVE`. Click the provider icons in the top bar.
   No compilation or separate binary is needed.

## Connect your accounts

Install and sign in to [Claude Code](https://code.claude.com/docs/en/setup) and/or
[Codex CLI](https://developers.openai.com/codex/cli/) on this same machine:

```sh
claude auth login
codex login
```

Headroom uses those existing sign-ins. Do not send anyone your credential files.
The Codex executable must be discoverable by the desktop collector; if a terminal
can run it but Headroom cannot, see [troubleshooting](#troubleshooting).
You can turn off either provider in Settings.

## Use

- Click the bar to see quota windows, reset countdowns, and forecasts.
- Click the gear for provider enablement, top-bar visibility, order, and costs.
- Click Refresh, or right-click the bar, to request an update. Automatic updates
  run every five minutes; repeated manual requests are limited to one per 20 seconds.
- A dash means unavailable; `!` marks stale data. Forecasts need a known window
  duration and enough elapsed time. They are estimates, not guarantees.
- **Use sample data** in Settings is for previews only. It stops live collection
  and adds a DEMO label. It is off by default. All screenshots here use sample data.

![Native Settings window](screenshots/preferences.png)

## Optional cost estimates

Costs estimate the API-equivalent USD value of your local CLI history. They are
not subscription charges and do not include history on other computers.
Quota readings work without this setup; turn off Show costs if you do not need it.

Install Node and [Bun](https://bun.sh/docs/installation), then run the bundled setup:

```sh
sudo apt install nodejs
~/.local/share/gnome-shell/extensions/headroom@steveclarke.github.io/bin/setup-costs
```

The setup installs the locked `ccusage` version without package install scripts.
It does not overwrite an existing mismatched installation. Refresh Headroom after
setup. If Bun was just installed, open a new terminal first so it is on PATH.

## Update or remove

To update, install the new release ZIP with the same `--force` command, then log
out and back in. Settings and CLI sign-ins remain separate from the extension.

To remove:

```sh
gnome-extensions disable headroom@steveclarke.github.io
gnome-extensions uninstall headroom@steveclarke.github.io
```

This leaves your CLI accounts and history alone. The optional reader is stored
under `~/.local/share/headroom/` (or your XDG data directory).

## Troubleshooting

- **No icon:** confirm GNOME 46 and `State: ACTIVE` using the command above. If
  extensions are globally disabled, turn them on in the Extensions application.
- **Unavailable or stale:** run the relevant CLI, sign in again if needed, and
  refresh. Claude's CLI refreshes its own expired credentials.
- **Codex not found:** a shell version manager may expose Codex only in interactive
  terminals. The collector searches standard user/system install paths and known
  mise locations. For a custom install, link its stable executable into
  `~/.local/bin/codex`, then log out and back in.
- **Cost reader missing:** complete the optional setup above, or turn off costs.
- **After an update:** log out and back in; toggling the extension does not reload
  its JavaScript modules on Wayland.

See [development and release instructions](gnome/README.md) and
[privacy/security notes](SECURITY.md). Please redact account details and usage
before opening an issue.

## Credits

An independent port of [Omarchy Headroom](https://github.com/steveclarke/omarchy-headroom).
Shared quota logic and MIT-licensed collectors are included with attribution in
[NOTICE](NOTICE). Provider names and icons belong to their respective owners.
This project is not affiliated with Anthropic or OpenAI. See [LICENSE](LICENSE).
