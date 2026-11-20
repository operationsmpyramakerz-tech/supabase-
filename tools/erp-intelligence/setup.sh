#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd -- "$script_dir/../.."
export PATH="$PATH:${UV_TOOL_BIN_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}"
export GRAPHIFY_NO_AUTO_REFRESH=1
graphify_package='graphifyy[sql]==0.9.113'

check_version() {
    local tool=$1 expected=$2 actual
    actual=$("$tool" --version)
    if [[ ${actual##* } != "$expected" ]]; then
        printf '%s: expected %s, found %s\n' "$tool" "$expected" "$actual" >&2
        return 1
    fi
    printf '%s\n' "$actual"
}

# Validate existing tools before installing anything.
for entry in graphify:0.9.113 gitnexus:1.6.12 codex:0.171.0; do
    tool=${entry%:*}
    if command -v "$tool" >/dev/null; then
        check_version "$tool" "${entry#*:}"
    fi
done

if ! command -v graphify >/dev/null; then
    uv tool install --python 3.12.3 "$graphify_package"
    check_version graphify 0.9.113
fi

# Run the checks in the CLI's Python environment, including for uv tool installs.
graphify_interpreter() {
    local launcher
    launcher=$(command -v graphify)
    IFS=' ' read -r -a graphify_python < "$launcher"
    if [[ ${graphify_python[0]:-} != '#!'* ]]; then
        printf 'Graphify needs a Python entry point. Use uv to install %s.\n' "$graphify_package" >&2
        return 1
    fi
    graphify_python[0]=${graphify_python[0]#\#!}
    if [[ ${graphify_python[0]##*/} != python* &&
        ! ( ${graphify_python[0]##*/} == env && ${graphify_python[1]:-} == python* ) ]]; then
        printf 'Graphify needs a Python entry point. Use uv to install %s.\n' "$graphify_package" >&2
        return 1
    fi
}
graphify_interpreter
sql_check='from tree_sitter import Language, Parser; import tree_sitter_sql; Parser(Language(tree_sitter_sql.language()))'
if ! "${graphify_python[@]}" -c "$sql_check" 2>/dev/null; then
    printf 'Restoring Graphify SQL support with %s.\n' "$graphify_package"
    uv tool install --python 3.12.3 "$graphify_package"
    check_version graphify 0.9.113
    graphify_interpreter
    "${graphify_python[@]}" -c "$sql_check"
fi
if ! command -v gitnexus >/dev/null; then
    npm install --global gitnexus@1.6.12
    check_version gitnexus 1.6.12
fi
if ! command -v codex >/dev/null; then
    npm install --global @openai/codex@0.171.0
    check_version codex 0.171.0
fi

# Restore only skill files. The platform installers also edit instructions and hooks.
"${graphify_python[@]}" - <<'PY'
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import graphify

package = Path(graphify.__file__).parent
for platform, skill in (("claude", "skill.md"), ("codex", "skill-codex.md")):
    destination = Path(f".{platform}/skills/graphify")
    references = package / "skills" / platform / "references"
    if not references.is_dir():
        raise SystemExit(f"Graphify references missing: {references}")
    files = [(source, destination / "references" / source.relative_to(references))
             for source in sorted(references.rglob("*")) if source.is_file()]
    files.append((package / skill, destination / "SKILL.md"))
    for source, target in files:
        if any(parent.is_symlink() for parent in target.parents):
            raise SystemExit(f"Graphify skill directory is a symlink: {target.parent}")
        if target.is_symlink() or target.is_file():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=target.parent) as staging:
            staged = Path(staging) / target.name
            staged.write_bytes(source.read_bytes())
            try:
                os.link(staged, target)
            except FileExistsError:
                if not (target.is_symlink() or target.is_file()):
                    raise
PY

# A successful listing is required before deciding that registration is missing.
mcp_servers=$(codex mcp list --json)
gitnexus_registered=$(python3 -c '
import json, sys
servers = json.load(sys.stdin)
print(any(server["name"] == "gitnexus" for server in servers))
' <<< "$mcp_servers")
if [[ $gitnexus_registered == False ]]; then
    codex mcp add gitnexus -- "$(command -v gitnexus)" mcp
fi

"$script_dir/refresh.sh"
"$script_dir/status.sh"
