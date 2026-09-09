=== UPDATES IN THIS WAVE ===

Wave 1, so this is the whole build. Two contract addresses tell the story better than a feature list:

7577ecf6fda6015f87c8efa9341da537c7fcf11a6ac0317daa904e97f8812bcf (v1, block 735676)
0ce149b8cd281c89d4a0ec55e4f56982fc3d934770345ab438352efd30bfc508 (v2, block 738714)

Both are on Midnight preview and both are still queryable from the public indexer with no wallet. The second exists because reviewing the first found a privacy bug.

THE BUG

Every position carried hash("pm:owner:", sk) as its owner tag, identical for every position one key opened. Splitting a large stake across several positions is the obvious way to blur its size, and that tag undid it: group the rows by owner, wait for the reveals, add the parts back together. The contract was hiding each individual stake perfectly and still leaking the total, because I had protected the value and not the linkage.

The tests did not catch it, and could not have: every one of them asserted about a single position. I found it by running the contract against Midnight's own review checklists (Midnight Expert) instead. Privacy is not a property of a field; it is a property of what an observer can correlate, and a test that examines one row at a time cannot see a correlation.

v2 blinds each owner tag with fresh randomness, so two positions by one key are unequal on-chain. Compact contracts are immutable, so this meant recompiling, regenerating proving keys and redeploying, which is why there are two addresses. A consequence worth stating: my own client can no longer pick out its own positions from public state either. It knows them only because it recorded the ids at commit time, which puts this UI in the position of any other observer.

WHAT ELSE IS THERE

The contract: five circuits, OPEN to REVEAL to RESOLVED, reveal-or-forfeit, pro-rata settlement published as terms rather than a computed payout, because Compact has no division operator.

36 Vitest cases and 52 probe assertions, run against the real compiled artifacts rather than a mock since a mock cannot catch a circuit bug, now including one asserting that reusing a blinding factor re-links positions.

Two front ends over one set of circuits: #/app runs the compiled contract in the browser with nothing installed, #/live drives the same circuits against the deployed contract through Lace, a proof server and the indexer. The landing page reads live contract state, so a visitor who installed nothing sees real position counts.

Live: https://darkstake.vercel.app
Code: https://github.com/JohnboscoE/Darkstake (see contract/SECURITY-REVIEW.md)

WHAT I KNOW IS MISSING

Entitlements are recorded, not paid: claimEntitlement writes who is owed what on what terms, and custody is Wave 2. The browser wallet path is written and typechecked but not yet exercised end to end, because proving on a 2011 CPU is impractical; the in-browser mode exists so the mechanism is demonstrable regardless.


=== MILESTONE: 2ND WAVE ===

Settlement that actually moves value, and a live path proven end to end.

Replace the entitlement ledger with shielded token custody so claimEntitlement transfers rather than records: stakes escrowed at commit, released pro-rata at claim. This is the largest remaining gap between the contract and a usable market.

Alongside it, close the testing gap: exercise commit, reveal, resolve and claim from the browser against the deployed contract through Lace and a proof server, on hardware that can prove, and publish a recorded walkthrough of the full lifecycle.


=== MILESTONE: 3RD WAVE ===

Remove the trusted resolver, and close the remaining correlation channels.

The resolver is currently one named account that can report an outcome the world disagrees with. Replace it with multi-party resolution or a dispute window with a challenge period, so settlement no longer depends on trusting a single party.

Then the two privacy limits that survive v2: commit timing, since transactions are ordered and an observer still learns when a position was opened, addressed by batching or delayed submission; and cross-market linkability, since one device key used in several markets is still correlatable between them, addressed by round-based key rotation.
