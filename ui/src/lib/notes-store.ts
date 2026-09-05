/**
 * Durable storage for the numbers that never reach the chain.
 *
 * A position's `stake` and `salt` exist only on the staker's machine. Lose them
 * and you cannot produce a reveal that matches the commitment, so the position
 * forfeits -- permanently, and with no recourse from the contract's side. That
 * is inherent to commit-reveal, not a defect.
 *
 * In the in-memory demo, losing notes on refresh is a curiosity. Against a real
 * contract it destroys a real position, which is why this exists.
 *
 * The same is true of the staker's secret key, which is why it lives here too.
 * `ownerHash` on every position is `hash(secretKey)`, so the key is what proves
 * a position is yours at reveal and at claim. In the simulation it is a fixed
 * constant per identity; against a real contract it is generated once per market
 * and never regenerated, because a new key is a new identity with no positions.
 *
 * Storage is keyed by contract address, so notes from different markets (and
 * from the simulation, which uses a sentinel address) cannot collide.
 *
 * NOT ENCRYPTED. Anything with access to this browser profile can read the
 * stakes. They are the user's own secrets and never leave the device, but
 * `localStorage` is not a vault -- a production build should use a key derived
 * from the wallet rather than plaintext.
 */

export interface StoredNote {
  positionId: bigint;
  stake: bigint;
  /** Blinds the stake commitment. Hides *how much*. */
  salt: Uint8Array;
  /**
   * Blinds the position's owner tag. Hides *that this position is yours*, and
   * therefore that it and your other positions are the same person's.
   *
   * A second secret to lose, which is a real cost. It buys the property that
   * splitting a large stake across several positions actually hides the total:
   * without it every position you open carries the same tag, and an observer
   * just adds your revealed parts back together.
   */
  ownerSalt: Uint8Array;
}

/** Marks notes belonging to the in-memory demo rather than a deployed market. */
export const SIMULATION_ADDRESS = 'simulation';

const KEY_PREFIX = 'darkstake:notes:';

type SerializedNote = {
  positionId: string;
  stake: string;
  salt: string;
  ownerSalt?: string;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const keyFor = (contractAddress: string, identityId: string): string =>
  `${KEY_PREFIX}${contractAddress}:${identityId}`;

/**
 * Every accessor is wrapped: `localStorage` throws outright in some contexts
 * (Safari private mode, embedded webviews, storage disabled by policy), and a
 * demo that crashes on load because it could not cache a salt is worse than one
 * that quietly keeps them in memory.
 */
const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const loadNotes = (contractAddress: string, identityId: string): StoredNote[] => {
  const raw = safeGet(keyFor(contractAddress, identityId));
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as SerializedNote[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => ({
      positionId: BigInt(n.positionId),
      stake: BigInt(n.stake),
      salt: fromHex(n.salt),
      // Notes written before owner blinding existed have no `ownerSalt`. They
      // belong to a market at a different address -- the contract changed, so
      // the deployment did -- and cannot be used against this one. Reading them
      // as zeros keeps the parse total; the reveal would fail on "not owner"
      // rather than crash here.
      ownerSalt: n.ownerSalt === undefined ? new Uint8Array(32) : fromHex(n.ownerSalt),
    }));
  } catch {
    // Corrupt or from an older shape. Dropping is safe: notes are a cache of
    // what the user already holds, and a bad parse must not break the app.
    return [];
  }
};

export const saveNotes = (contractAddress: string, identityId: string, notes: StoredNote[]): boolean => {
  const serialized: SerializedNote[] = notes.map((n) => ({
    positionId: n.positionId.toString(),
    stake: n.stake.toString(),
    salt: toHex(n.salt),
    ownerSalt: toHex(n.ownerSalt),
  }));
  return safeSet(keyFor(contractAddress, identityId), JSON.stringify(serialized));
};

export const appendNote = (contractAddress: string, identityId: string, note: StoredNote): boolean => {
  const existing = loadNotes(contractAddress, identityId);
  // Re-committing the same id should replace, not duplicate.
  const next = existing.filter((n) => n.positionId !== note.positionId);
  next.push(note);
  return saveNotes(contractAddress, identityId, next);
};

const secretKeyFor = (contractAddress: string): string =>
  `${KEY_PREFIX}${contractAddress}:secret`;

/**
 * The staker's secret key for one market, generated on first use.
 *
 * Per market rather than per device, deliberately. The key used to deploy is
 * the resolver -- the only account that can ever close and resolve that market
 * -- so it must stay bound to the address it deployed. Reusing one key across
 * markets would make every market you joined resolvable by the same secret,
 * which is a worse default than a key you have to export per market.
 *
 * If storage is unavailable the key is still returned, so the session works;
 * it just will not survive a reload, and `secretKeyPersisted` reports that.
 */
export const loadOrCreateSecretKey = (contractAddress: string): Uint8Array => {
  const existing = safeGet(secretKeyFor(contractAddress));
  if (existing !== null && /^[0-9a-f]{64}$/.test(existing)) {
    return fromHex(existing);
  }
  const fresh = new Uint8Array(32);
  crypto.getRandomValues(fresh);
  safeSet(secretKeyFor(contractAddress), toHex(fresh));
  return fresh;
};

/** True when the key for this market survived, or will survive, a reload. */
export const secretKeyPersisted = (contractAddress: string): boolean =>
  safeGet(secretKeyFor(contractAddress)) !== null;

/**
 * Adopts a secret key exported from elsewhere -- the CLI's `.deployments` file,
 * or another browser. This is how a resolver key reaches the UI: the market is
 * deployed by the CLI, which writes the key to disk, and only the holder of
 * that key can close or resolve it.
 */
export const importSecretKey = (contractAddress: string, hex: string): Uint8Array => {
  const clean = hex.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error('A secret key is 64 hex characters (32 bytes).');
  }
  safeSet(secretKeyFor(contractAddress), clean);
  return fromHex(clean);
};

/**
 * Exports every note for a market as JSON.
 *
 * The escape hatch for the failure this module exists to prevent: browser
 * storage is per-profile and per-device, so a user who clears site data or
 * moves machines loses positions unless they took a copy first.
 */
export const exportNotes = (contractAddress: string, identityIds: string[]): string =>
  JSON.stringify(
    {
      contractAddress,
      exportedAt: new Date().toISOString(),
      // The notes are worthless without the key that proves the positions are
      // yours, so an export that omitted it would not actually be a backup.
      secretKey: safeGet(secretKeyFor(contractAddress)),
      identities: Object.fromEntries(
        identityIds.map((id) => [
          id,
          loadNotes(contractAddress, id).map((n) => ({
            positionId: n.positionId.toString(),
            stake: n.stake.toString(),
            salt: toHex(n.salt),
            ownerSalt: toHex(n.ownerSalt),
          })),
        ]),
      ),
    },
    null,
    2,
  );

/** True when notes will actually survive a refresh in this browser. */
export const storageAvailable = (): boolean => {
  const probe = `${KEY_PREFIX}__probe__`;
  if (!safeSet(probe, '1')) return false;
  try {
    localStorage.removeItem(probe);
  } catch {
    /* removal failing does not make storage unusable */
  }
  return true;
};
