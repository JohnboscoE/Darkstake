/**
 * Private state for the prediction market.
 *
 * Everything in here is supplied off-chain and enters a circuit only through a
 * `witness`. None of it reaches the ledger unless a circuit explicitly calls
 * `disclose()` on it -- and for `stake`, that must not happen until reveal.
 */
export type PMPrivateState = {
  /** The staker's local secret. Never leaves the machine. */
  readonly secretKey: Uint8Array;
  /** The amount being staked. Sealed behind a commitment until reveal. */
  readonly stake: bigint;
  /** Blinding factor. Without it the commitment would be brute-forceable. */
  readonly salt: Uint8Array;
  /**
   * Blinding factor for the position's owner tag.
   *
   * Separate from `salt` on purpose. `salt` hides *how much* was staked; this
   * hides *that two positions belong to the same person*. Sharing one value
   * between them would make the owner tag recomputable from anything that
   * reveals the stake salt, and would re-link the positions it exists to
   * separate.
   */
  readonly ownerSalt: Uint8Array;
};

export const createPMPrivateState = (
  secretKey: Uint8Array,
  stake: bigint,
  salt: Uint8Array,
  ownerSalt: Uint8Array,
): PMPrivateState => ({ secretKey, stake, salt, ownerSalt });

type Ctx = { privateState: PMPrivateState };

export const createWitnesses = () => ({
  localSecretKey: ({ privateState }: Ctx): [PMPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
  stakeValue: ({ privateState }: Ctx): [PMPrivateState, bigint] => [
    privateState,
    privateState.stake,
  ],
  stakeSalt: ({ privateState }: Ctx): [PMPrivateState, Uint8Array] => [
    privateState,
    privateState.salt,
  ],
  ownerSalt: ({ privateState }: Ctx): [PMPrivateState, Uint8Array] => [
    privateState,
    privateState.ownerSalt,
  ],
});
