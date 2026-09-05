#!/usr/bin/env bash
#
# Pulls the compiled contract and proving keys from the latest successful
# `proving-keys` run and puts every copy where it belongs.
#
# Why this exists rather than a line in the README: the artifact has to land in
# three places with different rules, and getting any one of them wrong fails
# later and somewhere else.
#
#   contract/managed/prediction-market/contract/  committed -- the UI imports it
#   contract/managed/prediction-market/keys/      gitignored -- 18 MB, deploy reads it
#   ui/public/{keys,zkir}/                        committed -- served to the browser
#
# The keys are ignored in the build tree and committed under ui/public. That
# looks inconsistent and is not: `FetchZkConfigProvider` fetches them from the
# site's own origin at runtime, so Vercel has to build from a clone that has
# them, while the build tree's copy is reproducible from this script.
#
# Usage, from the repo root:
#   .devcontainer/adopt-keys.sh            # latest successful run
#   .devcontainer/adopt-keys.sh 1234567890 # a specific run id

set -euo pipefail

cd "$(dirname "$0")/.."

CIRCUITS="commitPosition closeMarket revealPosition resolve claimEntitlement"

command -v gh >/dev/null || {
  echo "error: gh is not installed. This script is meant for the Codespace," >&2
  echo "       where gh is present and already authenticated." >&2
  exit 1
}

RUN_ID="${1:-}"
if [ -z "$RUN_ID" ]; then
  echo "Finding the latest successful proving-keys run..."
  RUN_ID="$(gh run list --workflow=proving-keys.yml --status=success \
    --limit 1 --json databaseId --jq '.[0].databaseId')"
  [ -n "$RUN_ID" ] || { echo "error: no successful run found" >&2; exit 1; }
fi

# Warn rather than refuse. Adopting keys from an older run is occasionally what
# you want (bisecting a bad build), but doing it by accident produces a
# verifier-key mismatch at deploy time, which reports as a type error and names
# nothing useful.
RUN_SHA="$(gh run view "$RUN_ID" --json headSha --jq .headSha)"
HEAD_SHA="$(git rev-parse HEAD)"
echo "Run $RUN_ID built ${RUN_SHA:0:8}; HEAD is ${HEAD_SHA:0:8}"
if [ "$RUN_SHA" != "$HEAD_SHA" ]; then
  echo
  echo "WARNING: these keys were NOT built from the commit you have checked out."
  echo "         If prediction-market.compact differs between them, the keys will"
  echo "         not match the contract and the deploy will fail obscurely."
  echo
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading artifact..."
gh run download "$RUN_ID" --name managed --dir "$TMP"

SRC="$TMP/prediction-market"
[ -d "$SRC/contract" ] || { echo "error: artifact has no contract/ dir" >&2; ls -R "$TMP" >&2; exit 1; }
[ -d "$SRC/keys" ]     || { echo "error: artifact has no keys/ dir" >&2; exit 1; }

for c in $CIRCUITS; do
  [ -s "$SRC/keys/$c.prover" ]   || { echo "error: missing $c.prover" >&2; exit 1; }
  [ -s "$SRC/keys/$c.verifier" ] || { echo "error: missing $c.verifier" >&2; exit 1; }
  [ -s "$SRC/zkir/$c.bzkir" ]    || { echo "error: missing $c.bzkir" >&2; exit 1; }
done
echo "All five circuits present."

DEST="contract/managed/prediction-market"
mkdir -p "$DEST" ui/public/keys ui/public/zkir
rm -rf "$DEST/contract" "$DEST/keys" "$DEST/zkir" "$DEST/compiler"
cp -r "$SRC/." "$DEST/"

# The browser gets the binary .bzkir, not the .zkir text form. Copying the whole
# directory would ship ~40 KB of unused text and, worse, make it ambiguous which
# one FetchZkConfigProvider is actually serving.
cp "$DEST"/keys/*.prover   ui/public/keys/
cp "$DEST"/keys/*.verifier ui/public/keys/
cp "$DEST"/zkir/*.bzkir    ui/public/zkir/

echo
echo "Adopted from run $RUN_ID:"
du -sh "$DEST/keys" ui/public/keys
echo
echo "Next:"
echo "  git add contract/managed ui/public && git commit -m 'Adopt proving keys from run $RUN_ID'"
echo "  cd cli && npm run deploy -- --network preview --proof-server http://localhost:6300"
