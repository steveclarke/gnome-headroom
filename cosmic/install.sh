#!/usr/bin/env bash
# Build and install Headroom for the COSMIC panel, for this user only (nothing needs sudo).
#
#   cosmic/install.sh            build, install, and restart the applet if it is in the panel
#   cosmic/install.sh --panel    the same, and add it to the top panel (first on the right)
#   cosmic/install.sh --remove   take it out of the panel and delete what was installed
#
# Needs: cargo (rustup, toolchain from cosmic/applet/rust-toolchain.toml), libxkbcommon-dev,
# libwayland-dev, pkg-config, gjs, python3.
set -euo pipefail

APP_ID=io.github.steveclarke.Headroom
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname -- "$here")"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
bin="$HOME/.local/bin/cosmic-applet-headroom"
share="$data/headroom-cosmic"
desktop="$data/applications/$APP_ID.desktop"
wings="${XDG_CONFIG_HOME:-$HOME/.config}/cosmic/com.system76.CosmicPanel.Panel/v1/plugins_wings"
target="${CARGO_TARGET_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/headroom-cosmic-target}"

in_panel() { [ -f "$wings" ] && grep -q "\"$APP_ID\"" "$wings"; }

# The panel's right-hand list is the second [ ... ] in plugins_wings. The panel re-reads the file
# when it changes and starts or stops applets to match.
panel_add() {
  in_panel && return 0
  python3 - "$wings" "$APP_ID" <<'PY'
import os, re, sys
path, app = sys.argv[1], sys.argv[2]
by_hand = '; add the applet in Settings > Desktop > Panel > Applets'
# A panel that has never been changed has no layout file of its own yet.
if not os.path.exists(path):
    sys.exit('Headroom is installed, but this panel has no layout file yet' + by_hand)
text = open(path).read()
opens = [m.end() for m in re.finditer(r'\[', text)]
if len(opens) < 2:
    sys.exit('Headroom is installed, but ' + path + ' was not recognised' + by_hand)
at = opens[1]
open(path, 'w').write(text[:at] + '\n    "' + app + '",' + text[at:])
PY
}

panel_remove() {
  in_panel || return 0
  python3 - "$wings" "$APP_ID" <<'PY'
import re, sys
path, app = sys.argv[1], sys.argv[2]
text = open(path).read()
open(path, 'w').write(re.sub(r'\n?[ \t]*"' + re.escape(app) + r'",?', '', text))
PY
}

if [ "${1:-}" = "--remove" ]; then
  panel_remove
  rm -f -- "$bin" "$desktop"
  rm -rf -- "${share:?}"
  echo "Headroom removed. Settings in ~/.config/headroom were left alone."
  exit 0
fi

python3 "$here/build.py" >/dev/null
(cd "$here/applet" && CARGO_TARGET_DIR="$target" cargo build --release --locked)

mkdir -p "$(dirname -- "$bin")" "$(dirname -- "$desktop")"
rm -rf -- "${share:?}"
cp -r "$root/build/cosmic/headroom" "$share"
install -m 755 "$target/release/cosmic-applet-headroom" "$bin.new"
mv -f -- "$bin.new" "$bin"
cat > "$desktop" <<EOF
[Desktop Entry]
Name=Headroom
Comment=Claude Code and Codex quotas, reset countdowns and forecasts
Type=Application
Exec=$bin
Terminal=false
Categories=COSMIC;
Keywords=COSMIC;Applet;Claude;Codex;Quota;Usage;
Icon=utilities-system-monitor-symbolic
StartupNotify=true
NoDisplay=true
X-CosmicApplet=true
X-CosmicHoverPopup=Auto
EOF

if [ "${1:-}" = "--panel" ]; then
  panel_add
  echo "Headroom installed and added to the top panel."
elif in_panel; then
  # Already in the panel. The panel does not start an applet again once it has stopped, but it
  # does re-read its layout: take the applet out and put the layout back as it was (same place).
  layout="$(cat "$wings")"
  panel_remove
  sleep 2
  printf '%s' "$layout" > "$wings"
  echo "Headroom installed; the panel is restarting it."
else
  echo "Headroom installed. Add it with: cosmic/install.sh --panel (or Settings > Desktop > Panel > Applets)."
fi
