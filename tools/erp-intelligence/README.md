# ERP development intelligence

Run these commands from the checkout root.

```bash
tools/erp-intelligence/setup.sh
tools/erp-intelligence/status.sh
tools/erp-intelligence/refresh.sh
```

`setup.sh` checks installed versions, installs missing commands, and checks
that Graphify can initialize its SQL parser. It installs the pinned SQL extra
with uv if the parser is missing. It stops on a version mismatch before
installing anything. Use a Linux development checkout with Bash, Git, Python 3, and
`flock` (util-linux). For missing tools, provide `uv` and a user-writable npm
global prefix whose bin directory is on PATH. The original runtime was
Node.js 24.22.2.

| Command | Pinned package |
| --- | --- |
| Graphify | `graphifyy[sql]==0.9.113` via uv with Python 3.12.3 |
| GitNexus | `gitnexus@1.6.12` via npm |
| Codex | `@openai/codex@0.171.0` via npm |

Package installation needs registry access. These pins reproduce the CLI
versions. Runtime binaries, transitive dependencies, and native extension
artifacts still depend on the host and upstream package registries.

Run `refresh.sh` after approved code changes as directed by `AGENTS.md`.
It serializes calls through this script per checkout, uses Graphify's AST-only
update, and runs GitNexus with load-only extensions and index-only mode.
GitNexus stores graph data with source-text retention disabled. Graph queries
remain available, while source-text retrieval from the index is unavailable.
Keep any sensitive files outside the checkout and maintain the scanner
exclusions in `.graphifyignore` and `.gitnexusignore`.
GitNexus also needs write access to its user-level repository registry
(`~/.gitnexus` by default). Run refresh from a development shell with that
access if an agent sandbox confines writes to the checkout.

A fresh host may need to provision GitNexus's compatible LadybugDB FTS
extension once. When network access is approved, run this from the checkout
root if GitNexus reports a missing extension, then rerun setup.

```bash
GITNEXUS_CONTENT_RETENTION=none GITNEXUS_LBUG_EXTENSION_INSTALL=auto gitnexus analyze --index-only
```

Setup restores missing Graphify skill and reference files under
`.codex/skills/graphify` and `.claude/skills/graphify`, preserving existing
files and project instructions. It registers GitNexus in the standalone
Codex CLI configuration if the `gitnexus` entry is absent. Codex authentication
and editor-managed MCP configuration are handled by the host.

Setup then runs `refresh.sh` to create or update both local indexes and runs
`status.sh` to report their status. The root `.gitignore` excludes the generated
index directories from future Git additions.

`status.sh` shows CLI versions and GitNexus's native coverage and freshness
report. Graphify freshness compares recorded manifest timestamps and flags
newer working-tree files outside the manifest for review. The second count
can include files Graphify intentionally excludes. Timestamp checks cannot
detect edits that preserve timestamps or older files missing from the manifest.

Validate the shell scripts with Bash.

```bash
for script in tools/erp-intelligence/*.sh; do bash -n "$script" || exit; done
```
