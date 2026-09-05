#!/usr/bin/env bash
#
# Builds the contract WITH proving keys and puts every copy where it belongs.
#
# Compiles locally when the Compact toolchain is present -- which it is in the
# devcontainer, where `setup.sh` installs it -- and only falls back to
# downloading a CI artifact when it is not. The CI workflow exists because the
# project's own dev machine is a 2011 Sandy Bridge with no bmi2/adx, so `zkir`
# dies there with SIGILL; a Codespace runner has those instructions and can do
# the build itself in a few minutes. Downloading an artifact to a box that can
# compile is a detour through an authenticated API for no benefit.
#
# The output has to land in three places with different rules, and getting any
# one of them wrong fails later and somewhere else:
#
#   contract/managed/prediction-market/contract/  committed -- the UI imports it
#   contract/managed/prediction-market/keys/      gitignored -- 18 MB, deploy reads it
#   ui/public/{keys,zkir}/                        committed -- served to the browser
#
# Keys ignored in the build tree but committed under ui/public looks
# inconsistent and is not: `FetchZkConfigProvider` fetches them from the site's
# own origin at runtime, so Vercel must build from a clone that has them, while
# the build tree's copy is reproducible by running this.
#
# Usage, from anywhere:
#   .devcontainer/adopt-keys.sh              # compile here if possible
#   .devcontainer/adopt-keys.sh --ci [RUN]   # force the CI artifact path (needs gh)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

CIRCUITS="commitPosition closeMarket revealPosition resolve claimEntitlement"
DEST="contract/managed/prediction-market"

MODE="auto"
RUN_ID=""
if [ "${1:-}" = "--ci" ]; then
  MODE="ci"
  RUN_ID="${2:-}"
fi

# ── Build, one way or the other ───────────────────────────────────────────────

build_locally() {
  # Same guard the CI workflow uses. Without bmi2/adx, zkir does not fail
  # gracefully -- it takes SIGILL, and the compile dies with a signal rather
  # than a message about instruction sets.
  local missing=""
  for f in bmi2 adx; do
    grep -m1 '^flags' /proc/cpuinfo | tr ' ' '\n' | grep -qx "$f" || missing="$missing $f"
  done
  if [ -n "$missing" ]; then
    echo "This CPU lacks:$missing -- zkir would SIGILL. Use --ci instead." >&2
    return 1
  fi

  echo "==> Compiling with proving keys (slow; key generation dominates)"
  # No --skip-zk: the keys are the whole point.
  ( cd contract && compact compile prediction-market.compact managed/prediction-market )
}

download_from_ci() {
  command -v gh >/dev/null || {
    echo "error: gh is not installed, and this machine cannot compile either." >&2
    echo "       Install gh, or run the proving-keys workflow and unzip its" >&2
    echo "       'managed' artifact into contract/managed/." >&2
    return 1
  }

  if [ -z "$RUN_ID" ]; then
    echo "==> Finding the latest successful proving-keys run"
    RUN_ID="$(gh run list --workflow=proving-keys.yml --status=success \
      --limit 1 --json databaseId --jq '.[0].databaseId')"
    [ -n "$RUN_ID" ] || { echo "error: no successful run found" >&2; return 1; }
  fi

  # Warn rather than refuse. Adopting keys from an older run is occasionally
  # what you want, but doing it by accident gives a verifier-key mismatch at
  # deploy time, which reports as a type error and names nothing useful.
  local run_sha head_sha
  run_sha="$(gh run view "$RUN_ID" --json headSha --jq .headSha)"
  head_sha="$(git rev-parse HEAD)"
  echo "==> Run $RUN_ID built ${run_sha:0:8}; HEAD is ${head_sha:0:8}"
  if [ "$run_sha" != "$head_sha" ]; then
    echo
    echo "WARNING: these keys were NOT built from the commit you have checked out."
    echo "         If prediction-market.compact differs between them, the keys do"
    echo "         not match the contract and the deploy will fail obscurely."
    echo
  fi

  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN

  gh run download "$RUN_ID" --name managed --dir "$tmp"
  [ -d "$tmp/prediction-market/contract" ] || {
    echo "error: artifact has no prediction-market/contract dir" >&2
    ls -R "$tmp" >&2
    return 1
  }
  mkdir -p "$DEST"
  rm -rf "${DEST:?}/contract" "${DEST:?}/keys" "${DEST:?}/zkir" "${DEST:?}/compiler"
  cp -r "$tmp/prediction-market/." "$DEST/"
}

if [ "$MODE" = "ci" ]; then
  download_from_ci
elif command -v compact >/dev/null && build_locally; then
  :
else
  echo "==> Falling back to the CI artifact"
  download_from_ci
fi

# ── Check what actually arrived ───────────────────────────────────────────────

for c in $CIRCUITS; do
  for f in "keys/$c.prover" "keys/$c.verifier" "zkir/$c.bzkir"; do
    [ -s "$DEST/$f" ] || { echo "error: missing or empty $DEST/$f" >&2; exit 1; }
  done
done
echo "==> All five circuits have prover, verifier and bzkir"

# The generated binding must match the contract we just built, or the UI
# imports one shape and the chain enforces another.
for symbol in resolverId ownerTag stakeCommit; do
  grep -q "$symbol" "$DEST/contract/index.d.ts" || {
    echo "error: generated contract has no '$symbol' -- stale build?" >&2
    exit 1
  }
done
echo "==> Generated binding exports the v2 circuits"

# ── Publish to the UI ─────────────────────────────────────────────────────────

mkdir -p ui/public/keys ui/public/zkir
rm -f ui/public/keys/*.prover ui/public/keys/*.verifier ui/public/zkir/*.bzkir
cp "$DEST"/keys/*.prover   ui/public/keys/
cp "$DEST"/keys/*.verifier ui/public/keys/
# The browser gets the binary .bzkir, never the .zkir text form. Copying both
# would ship ~40 KB unused and make it ambiguous which one is being served.
cp "$DEST"/zkir/*.bzkir    ui/public/zkir/

# ── Prove the artifacts behave, before anything is deployed against them ──────

if [ -f contract/node_modules/.package-lock.json ] || [ -d contract/node_modules ]; then
  echo "==> Running the adversarial probe against the fresh artifacts"
  ( cd contract && node probe.mjs >/dev/null && echo "    probe passed" )
else
  echo "==> Skipping probe (contract/node_modules absent; run npm install to enable)"
fi

echo
du -sh "$DEST/keys" ui/public/keys
echo
echo "Next:"
echo "  cd $ROOT && git add contract/managed ui/public && git commit -m 'Adopt v2 proving keys'"
echo "  cd $ROOT/cli && npm run deploy -- --network preview --proof-server http://localhost:6300"
