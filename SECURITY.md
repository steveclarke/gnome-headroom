# Privacy and security

Headroom runs as your desktop user. It is not a sandbox for untrusted CLI programs.
It uses your existing local Claude Code and Codex sign-ins; it does not ask for
credentials or send data to a Headroom server. There is no Headroom telemetry.

Claude quota checks read the CLI OAuth file and contact Anthropic's HTTPS usage
endpoint. Redirects are refused so the authorization header stays at that endpoint.
Codex quota checks ask the installed CLI's app-server for account rate limits.
The provider CLIs and their services retain their own network behavior.

Collectors can read local CLI history and write owner-only usage caches under the
XDG cache directory. The optional ccusage reader calculates from local history;
its pricing/dependency downloads may contact upstream services. Cost workers use
an isolated temporary home and a reduced environment. This is not a network sandbox.

Reports are size-limited and validated before display. Collector execution has a
time limit; disabling Headroom terminates its worker groups. The release ZIP is
built from an explicit file list and contains no account data or local history.

Do not attach credentials, raw usage reports, session logs, or screenshots with
private data to issues. Report suspected vulnerabilities privately through
[GitHub's security advisory form](https://github.com/steveclarke/gnome-headroom/security/advisories/new).

The optional installer downloads the public release over HTTPS and checks its
SHA256SUMS. With `--costs`, it uses a checksum-pinned temporary Bun executable to
set up the locked cost reader. It can ask Ubuntu to install missing Settings/Node
packages using sudo; the extension itself runs without elevated privileges.
