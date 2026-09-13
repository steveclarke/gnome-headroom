#!/usr/bin/env bash
set -euo pipefail

# Assemble a standalone GNOME extension without editing shared source files.
main() {
  local script_dir
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  exec python3 "$script_dir/build.py"
}

main "$@"
