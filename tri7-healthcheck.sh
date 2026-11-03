#!/bin/bash
# tri7-healthcheck.sh — TRIdock TRI7-era healthcheck.
# Uses tri7d's own --status surface: exit 0 healthy; non-zero when the state
# file is unreadable/stale or the node is degraded (no peer traffic AND no tip
# advance past the quiet windows). In seed/full modes the network gate applies;
# set TRI_STATIC=1 for air-gapped/static nodes.
set -u
ARGS=(--status --state-dir /var/lib/tri7)
[ "${TRI_STATIC:-0}" = "1" ] && ARGS+=(--static)
exec /usr/local/bin/tri7d "${ARGS[@]}"
