=== UPDATES IN THIS WAVE ===

This is Wave 1, so everything below is new.

**Deliverables**
Live: https://darkstake.vercel.app
Code: https://github.com/JohnboscoE/Darkstake
Contract: 0ce149b8cd281c89d4a0ec55e4f56982fc3d934770345ab438352efd30bfc508 on Midnight preview, block 738714

Anyone can verify that deployment against the public Midnight indexer with no wallet and no trust in this repo; DEPLOYMENTS.md has the one-line curl and every transaction hash.

**What shipped**

1. The Compact contract. A commit-reveal prediction market: five circuits, phases OPEN -> REVEAL -> RESOLVED, reveal-or-forfeit, and pro-rata settlement published as terms rather than a computed payout, since Compact has no division operator.

2. Deployed and independently verifiable on Midnight preview. Proving keys come from a pinned CI toolchain; the deploy produced real proofs and paid fees in dust.

3. An adversarial test suite against the real compiled artifacts, not a mock: 36 Vitest cases and 52 probe assertions covering forged stakes and salts, non-owner claims, double-claims and phase gating.

4. Two front-end modes over one set of circuits. #/app runs the compiled contract in the browser with nothing installed; #/live drives the same circuits against the deployed contract through Lace, a proof server and the indexer. So the demo cannot drift from the deployment.

5. The landing page reads live contract state straight from the public indexer, so a visitor who has installed nothing still sees real on-chain position counts.

**The most substantive change: a privacy bug found by review**

I reviewed the contract against Midnight's own checklists (Midnight Expert). It found a real bug.

Every position carried hash("pm:owner:", sk) as its owner tag, identical for every position one key opened. Splitting a large stake across several positions is the obvious way to blur its size; that tag undid it. Group the rows by owner, wait for the reveals, add the parts back together. The contract hid each individual stake perfectly and still leaked the total, because I had protected the value and not the linkage.

v2 blinds each owner tag with fresh randomness, so two positions by one key are unequal on-chain. Contract logic is immutable, so this cost a recompile, new proving keys and a redeploy to a new address. Full writeup: contract/SECURITY-REVIEW.md in the repo.

**Known gaps, stated plainly**

Entitlements are recorded, not paid: claimEntitlement writes who is owed what on what terms, and settlement with real custody is Wave 2. Live mode's wallet path is written and typechecked but has not yet been exercised end to end, because proving on my 2011 CPU is impractical; the in-browser mode exists so the mechanism is demonstrable regardless.


=== MILESTONE: 2ND WAVE ===

Settlement that actually moves value, and a live path proven end to end.

Replace the entitlement ledger with shielded token custody so claimEntitlement transfers rather than records: stakes escrowed at commit, released pro-rata at claim. This is the largest remaining gap between the contract and a usable market.

Alongside it, close the testing gap: exercise commit, reveal, resolve and claim from the browser against the deployed contract through Lace and a proof server, on hardware that can prove, and publish a recorded walkthrough of the full lifecycle.


=== MILESTONE: 3RD WAVE ===

Remove the trusted resolver, and close the remaining correlation channels.

The resolver is currently one named account that can report an outcome the world disagrees with. Replace it with multi-party resolution or a dispute window with a challenge period, so settlement no longer depends on trusting a single party.

Then the two privacy limits that survive v2: commit timing, since transactions are ordered and an observer still learns when a position was opened, addressed by batching or delayed submission; and cross-market linkability, since one device key used in several markets is still correlatable between them, addressed by round-based key rotation.
