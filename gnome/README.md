# Development

Target: Ubuntu 24.04 and GNOME Shell 46. Build with `./gnome/build.sh` from
the repository root. Python 3 and `glib-compile-schemas` are required.

The build copies Model, Pace, Costs, Wire, and Providers into the ZIP and appends
ES-module exports. The root logic files remain unchanged. Every collector report
passes through Wire before it reaches the UI. UsageService runs independent
provider workers every five minutes, with bounded output and execution time.
Disabling the extension stops its timers and collector process groups.

Run `node --test tests/*.test.cjs`, `python3 gnome/tests/check-collectors`,
`python3 gnome/tests/security.py`, `python3 gnome/tests/test-collector-regressions.py`,
`python3 gnome/tests/test-installer.py`, and `python3 gnome/tests/check-package.py`.
The package check requires a completed build. The collector check uses an empty
home and makes no authenticated provider calls.

For live integration testing on a signed-in GNOME machine:

```sh
gjs -m gnome/tests/service-smoke.js "$HOME/.local/share/gnome-shell/extensions/headroom@steveclarke.github.io"
```

This prints states and window counts only. Never save authenticated usage reports
or screenshots with live values in the repository. Use Settings → Use sample data
for screenshots, then turn it off.

After editing installed JavaScript on Wayland, log out and back in to load fresh
modules; disabling and enabling alone does not reload ESM. Check extension status
with `gnome-extensions info headroom@steveclarke.github.io` and errors with
`journalctl --user -b 0 /usr/bin/gnome-shell`.

## Releases

Update the integer version in `gnome/metadata.json`, commit, and push a tag such
as `v1.0.1`. GitHub Actions runs the checks, builds the extension ZIP, and publishes
a release with the installer and SHA256SUMS. The tag suffix is the user-facing release version;
GNOME uses the separate monotonically increasing metadata version.
