#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
result=0
for tool in graphify gitnexus codex; do
    if command -v "$tool" >/dev/null; then
        printf '%s: ' "$tool"
        "$tool" --version || result=1
    else
        printf '%s: unavailable\n' "$tool"
        result=1
    fi
done

python3 - <<'PY' || result=1
import json
import subprocess
from pathlib import Path

graph = Path("graphify-out/graph.json")
manifest = graph.with_name("manifest.json")
if not graph.is_file() or graph.stat().st_size == 0:
    raise SystemExit("Graphify index: unavailable")
print("Graphify index: available")
try:
    entries = json.loads(manifest.read_text())
    if not isinstance(entries, dict) or not entries:
        raise ValueError
    changed = 0
    for name, entry in entries.items():
        path = Path(name)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError
        changed += not path.is_file() or path.stat().st_mtime != entry["mtime"]
    new = sum(
        Path(name).stat().st_mtime > graph.stat().st_mtime
        for name in subprocess.check_output(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"]
        ).decode(errors="surrogateescape").split("\0")
        if name and name not in entries and Path(name).is_file()
    )
except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError):
    raise SystemExit("Graphify freshness: unknown (manifest or working tree unavailable)")
if changed or new:
    print(f"Graphify freshness: review needed ({changed} changed or missing manifest paths, "
          f"{new} newer working-tree paths outside the manifest)")
else:
    print(f"Graphify freshness: no changes detected by the timestamp check ({len(entries)} manifest paths)")
PY

if command -v gitnexus >/dev/null; then
    gitnexus status || result=1
else
    printf 'GitNexus index: status unavailable without the CLI\n'
fi
exit "$result"
