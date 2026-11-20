#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
export PATH="$PATH:${UV_TOOL_BIN_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}"

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
    uv tool install --python 3.12.3 'graphifyy==0.9.113'
    check_version graphify 0.9.113
fi
if ! command -v gitnexus >/dev/null; then
    npm install --global gitnexus@1.6.12
    check_version gitnexus 1.6.12
fi
if ! command -v codex >/dev/null; then
    npm install --global @openai/codex@0.171.0
    check_version codex 0.171.0
fi

"$script_dir/refresh.sh"
"$script_dir/status.sh"
