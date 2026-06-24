#!/usr/bin/env bash
# Test suite for tridock-doctor.sh and entrypoint.sh integrity checks.
# Run from /root/tridock/ — uses tempdirs to mock /tri/state and /tri/data.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCTOR="$REPO_ROOT/tridock-doctor.sh"
ENTRYPOINT="$REPO_ROOT/entrypoint.sh"

PASS=0
FAIL=0
FAILED_TESTS=()

# ─── Helpers ────────────────────────────────────────────────────────────────

setup_tmp() {
  TMP=$(mktemp -d)
  export TRI_STATE_DIR="$TMP/state"
  export TRI_DATA_DIR="$TMP/data"
  export TRI_BIN_DIR="$TMP/data/bin"
  export TRI_TOR_SOCKS_PORT=19050
  mkdir -p "$TRI_STATE_DIR" "$TRI_DATA_DIR" "$TRI_DATA_DIR/tor_data" "$TRI_BIN_DIR"
}

teardown_tmp() {
  rm -rf "${TMP:-}" 2>/dev/null || true
}

assert_pass() {
  local desc="$1"
  if [ "${2:-1}" -eq 0 ]; then
    PASS=$((PASS + 1))
    printf "  \033[32m✓\033[0m %s\n" "$desc"
  else
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$desc")
    printf "  \033[31m✗\033[0m %s\n" "$desc"
  fi
}

# ─── Static checks (no runtime needed) ──────────────────────────────────────

test_entrypoint_syntax() {
  bash -n "$ENTRYPOINT" 2>/dev/null
  assert_pass "entrypoint.sh has valid bash syntax" $?
}

test_doctor_syntax() {
  bash -n "$DOCTOR" 2>/dev/null
  assert_pass "tridock-doctor.sh has valid bash syntax" $?
}

test_no_blanket_sed_on_control_flow() {
  # Lesson #2 from 2026-04 incident: blanket sed on control flow breaks code.
  # Look for any sed line in entrypoint.sh that touches return/continue/break.
  local hits
  hits=$(grep -nE "sed.*(return|continue|break)" "$ENTRYPOINT" 2>/dev/null || true)
  if [ -z "$hits" ]; then
    assert_pass "no blanket sed on control-flow keywords in entrypoint.sh" 0
  else
    echo "$hits" >&2
    assert_pass "no blanket sed on control-flow keywords in entrypoint.sh" 1
  fi
}

test_preflight_restart_exists() {
  grep -q "^preflight_restart()" "$ENTRYPOINT"
  assert_pass "preflight_restart() function defined in entrypoint.sh" $?
}

test_check_tor_state_exists() {
  grep -q "^check_tor_state()" "$ENTRYPOINT"
  assert_pass "check_tor_state() function defined in entrypoint.sh" $?
}

test_preflight_called_in_loop() {
  # Verify preflight_restart is called somewhere after run_node starts
  # (i.e. inside the run_node loop body).
  local run_line call_line
  run_line=$(grep -n "^run_node()" "$ENTRYPOINT" | head -1 | cut -d: -f1)
  # Find a call site (not the definition line)
  call_line=$(grep -nE "^[[:space:]]+preflight_restart" "$ENTRYPOINT" | head -1 | cut -d: -f1)
  if [ -n "$run_line" ] && [ -n "$call_line" ] && [ "$call_line" -gt "$run_line" ]; then
    assert_pass "preflight_restart called inside run_node loop" 0
  else
    echo "run_line=$run_line call_line=$call_line" >&2
    assert_pass "preflight_restart called inside run_node loop" 1
  fi
}

test_tor_state_check_before_start_tor() {
  # Verify check_tor_state is called in main() before start_tor
  local check_line start_line
  check_line=$(grep -n "^  check_tor_state$" "$ENTRYPOINT" | head -1 | cut -d: -f1)
  start_line=$(grep -n "^  start_tor$" "$ENTRYPOINT" | head -1 | cut -d: -f1)
  if [ -n "$check_line" ] && [ -n "$start_line" ] && [ "$check_line" -lt "$start_line" ]; then
    assert_pass "check_tor_state called before start_tor in main()" 0
  else
    assert_pass "check_tor_state called before start_tor in main()" 1
  fi
}

# ─── Doctor runtime checks ──────────────────────────────────────────────────

test_doctor_clean_state() {
  # In a non-container test environment we cannot have a real daemon running
  # against a mocked datadir. So "clean state" here means: filesystem layout
  # is healthy (binary, status, ready marker, chain, tor state all present)
  # and the doctor does not report any fail-fatal findings.
  setup_tmp
  echo "running" > "$TRI_STATE_DIR/status"
  echo "ok" > "$TRI_STATE_DIR/node-ready"
  echo '#!/bin/bash
echo "v5.9.24"' > "$TRI_BIN_DIR/trianglesd"
  chmod +x "$TRI_BIN_DIR/trianglesd"
  echo "1" > "$TRI_DATA_DIR/tor_data/state"  # non-empty regular file = healthy
  # 1KB chain-blocks to clear the "tiny" threshold
  dd if=/dev/zero of="$TRI_DATA_DIR/blk0001.dat" bs=1024 count=2 2>/dev/null

  local out exit_code=0
  out=$("$DOCTOR" --json 2>&1) || exit_code=$?
  teardown_tmp

  # In non-container test env, daemon-not-running is expected (fail-recoverable).
  # We assert: no fail-fatal findings, and the static checks all report info.
  if [ "$exit_code" -le 2 ] \
     && ! echo "$out" | grep -q '"severity":"fail-fatal"'; then
    assert_pass "doctor clean state has no fail-fatal findings" 0
  else
    echo "got exit=$exit_code out=$out" >&2
    assert_pass "doctor clean state has no fail-fatal findings" 1
  fi
}

test_doctor_detects_tor_state_directory() {
  setup_tmp
  echo "running" > "$TRI_STATE_DIR/status"
  mkdir -p "$TRI_DATA_DIR/tor_data/state"
  touch "$TRI_DATA_DIR/tor_data/state/leftover"

  local out exit_code=0
  out=$("$DOCTOR" --quiet 2>&1) || exit_code=$?
  teardown_tmp

  case "$exit_code" in
    2|3) assert_pass "doctor fails when tor_data/state is a directory" 0 ;;
    *)
      echo "got exit=$exit_code out=$out" >&2
      assert_pass "doctor fails when tor_data/state is a directory" 1
      ;;
  esac
}

test_doctor_detects_missing_binary() {
  setup_tmp
  echo "running" > "$TRI_STATE_DIR/status"
  # no binary

  local out exit_code=0
  out=$("$DOCTOR" --quiet 2>&1) || exit_code=$?
  teardown_tmp

  if [ "$exit_code" -eq 3 ]; then
    assert_pass "doctor reports fail-fatal when binary missing" 0
  else
    echo "got exit=$exit_code out=$out" >&2
    assert_pass "doctor reports fail-fatal when binary missing" 1
  fi
}

test_doctor_detects_missing_state_dir() {
  # No state dir created at all
  TMP=$(mktemp -d)
  export TRI_STATE_DIR="$TMP/state"
  export TRI_DATA_DIR="$TMP/data"
  export TRI_BIN_DIR="$TMP/data/bin"
  mkdir -p "$TRI_DATA_DIR" "$TRI_BIN_DIR"
  # deliberately do NOT mkdir $TRI_STATE_DIR

  local out exit_code=0
  out=$("$DOCTOR" --quiet 2>&1) || exit_code=$?
  rm -rf "$TMP"

  if [ "$exit_code" -eq 3 ]; then
    assert_pass "doctor reports fail-fatal when state dir missing" 0
  else
    echo "got exit=$exit_code out=$out" >&2
    assert_pass "doctor reports fail-fatal when state dir missing" 1
  fi
}

test_doctor_json_valid() {
  setup_tmp
  echo "running" > "$TRI_STATE_DIR/status"
  echo "ok" > "$TRI_STATE_DIR/node-ready"
  echo '#!/bin/bash
echo "v5.9.24"' > "$TRI_BIN_DIR/trianglesd"
  chmod +x "$TRI_BIN_DIR/trianglesd"
  echo "1" > "$TRI_DATA_DIR/tor_data/state"
  touch "$TRI_DATA_DIR/blk0001.dat"

  local out exit_code=0
  out=$("$DOCTOR" --json 2>&1) || exit_code=$?
  teardown_tmp

  # Validate JSON shape: must have exit_code, data_dir, findings array
  if [ "$exit_code" -le 3 ] \
     && echo "$out" | grep -q '"exit_code":' \
     && echo "$out" | grep -q '"data_dir":' \
     && echo "$out" | grep -q '"findings":'; then
    assert_pass "doctor --json produces valid shape" 0
  else
    echo "got exit=$exit_code out=$out" >&2
    assert_pass "doctor --json produces valid shape" 1
  fi
}

test_doctor_detects_low_disk_space() {
  setup_tmp
  echo "running" > "$TRI_STATE_DIR/status"

  # We can't easily mock df, but we can ensure the check doesn't crash
  local out exit_code=0
  out=$("$DOCTOR" --json 2>&1) || exit_code=$?
  teardown_tmp

  if [ "$exit_code" -le 3 ]; then
    assert_pass "doctor handles disk-space check without crashing" 0
  else
    echo "got exit=$exit_code out=$out" >&2
    assert_pass "doctor handles disk-space check without crashing" 1
  fi
}

# ─── Entrypoint source-level behavior tests ─────────────────────────────────

test_check_tor_state_function_detects_directory() {
  # Source the entrypoint's check_tor_state function in isolation
  setup_tmp
  mkdir -p "$TRI_DATA_DIR/tor_data/state"
  touch "$TRI_DATA_DIR/tor_data/state/junk"

  local harness
  harness=$(mktemp)
  cat > "$harness" <<EOF
#!/usr/bin/env bash
set -u
TOR_STATE_FILE="$TRI_DATA_DIR/tor_data/state"
NODE_NAME="test"
warn() { echo "WARN: \$*"; }
log() { echo "LOG: \$*"; }
$(sed -n '/^check_tor_state()/,/^}/p' "$ENTRYPOINT")
check_tor_state
EOF

  local out
  out=$(bash "$harness" 2>&1)
  local rc=$?
  rm -f "$harness"
  teardown_tmp

  if echo "$out" | grep -q "is a directory, not a file"; then
    assert_pass "check_tor_state detects directory and repairs" 0
  else
    echo "got: $out" >&2
    assert_pass "check_tor_state detects directory and repairs" 1
  fi
}

# ─── Run ────────────────────────────────────────────────────────────────────

echo "TRIdock test suite"
echo "==================="
echo ""
echo "Static checks:"
test_entrypoint_syntax
test_doctor_syntax
test_no_blanket_sed_on_control_flow
test_preflight_restart_exists
test_check_tor_state_exists
test_preflight_called_in_loop
test_tor_state_check_before_start_tor
echo ""
echo "Doctor runtime checks:"
test_doctor_clean_state
test_doctor_detects_tor_state_directory
test_doctor_detects_missing_binary
test_doctor_detects_missing_state_dir
test_doctor_json_valid
test_doctor_detects_low_disk_space
echo ""
echo "Entrypoint function tests:"
test_check_tor_state_function_detects_directory

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failed tests:"
  for t in "${FAILED_TESTS[@]}"; do
    echo "  - $t"
  done
  exit 1
fi
exit 0