#!/usr/bin/env bash
#
# One-time setup for the Darkstake devcontainer.
#
# The point of this container is the two things the dev machine cannot do:
# generate proving keys, and run a proof server. Both need a CPU with the bmi2
# and adx instructions; the dev box is a 2011 Sandy Bridge and `zkir` dies there
# with SIGILL. A Codespace is modern x86, so both work here.
set -euo pipefail

echo "==> apt prerequisites"
sudo apt-get update -qq
# The compact updater unzips its download and Debian slim images have no unzip.
sudo apt-get install -y -qq unzip

echo "==> Compact toolchain"
curl -sSL -o /tmp/compact-installer.sh \
  https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.2/compact-installer.sh
sh /tmp/compact-installer.sh

# The installer's target directory has moved between releases, so locate the
# binary rather than assuming $HOME/.local/bin.
COMPACT_BIN="$(find "$HOME" -maxdepth 5 -type f -name compact -perm -u+x 2>/dev/null | head -1)"
if [ -z "$COMPACT_BIN" ]; then
  echo "ERROR: compact binary not found under $HOME after install" >&2
  exit 1
fi
COMPACT_DIR="$(dirname "$COMPACT_BIN")"
export PATH="$COMPACT_DIR:$PATH"
grep -qxF "export PATH=\"$COMPACT_DIR:\$PATH\"" "$HOME/.bashrc" \
  || echo "export PATH=\"$COMPACT_DIR:\$PATH\"" >> "$HOME/.bashrc"

# 0.31.1 == language 0.23 + runtime 0.16.0 + ledger 8, matching the contract's
# pragma. 0.34.x targets ledger 9, which is not deployed.
compact update 0.31

# Never call ~/.compact/bin/compactc directly: it is a wrapper that execs
# compactc.bin, a file the installer does not create, so it exits 127 on a
# fresh box. `compact compile` resolves the versioned toolchain itself.
echo "==> toolchain installed at $COMPACT_DIR"

echo "==> npm dependencies"
for pkg in contract wallet cli ui; do
  if [ -f "$pkg/package.json" ]; then
    echo "  - $pkg"
    (cd "$pkg" && npm install --no-audit --no-fund --legacy-peer-deps)
  fi
done

cat <<'BANNER'

  Darkstake devcontainer ready.

  Proving keys      contract/managed/ is gitignored and starts empty. Build it
                    here (this CPU can, unlike the dev box):
                      cd contract && compact compile prediction-market.compact managed/prediction-market

  Proof server      already running on :6300 via postStartCommand. Check with
                      docker compose -f proof-server/docker-compose.yml ps
                    It is pinned to --network preview, matching the funded wallet.

  Deploy            cd cli && npm run deploy -- --network preview
                    Needs the wallet seed. Put it in a Codespaces secret rather
                    than shell history -- the deployer becomes the market's
                    resolver, so that key is not disposable.

  UI                cd ui && npm run dev    (port 3000, auto-forwarded)

BANNER
