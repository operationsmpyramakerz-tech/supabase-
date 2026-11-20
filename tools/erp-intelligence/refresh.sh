#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
export PATH="$PATH:${UV_TOOL_BIN_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}"
for tool in graphify gitnexus flock; do
    if ! command -v "$tool" >/dev/null; then
        printf 'Required command unavailable: %s\n' "$tool" >&2
        exit 1
    fi
done

# Serialize refreshes in this checkout without keeping a lock file.
exec 9<.
flock 9

result=0
GRAPHIFY_NO_AUTO_REFRESH=1 GRAPHIFY_BACKEND=none graphify update . || {
    printf 'Graphify refresh failed.\n' >&2
    result=1
}
# Avoid regenerating agent instructions and skills. Retain graph data only.
GITNEXUS_CONTENT_RETENTION=none GITNEXUS_LBUG_EXTENSION_INSTALL=load-only \
    gitnexus analyze --index-only || {
    printf 'GitNexus refresh failed. Check index status and user registry write access.\n' >&2
    result=1
}
exit "$result"
