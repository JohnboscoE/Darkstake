import { useCallback, useMemo, useRef, useState } from 'react';
import { MarketEngine, IDENTITIES, Side, type Identity } from '@/lib/market-engine';

const QUESTION = 'Will the Federal Reserve cut rates at the December 2026 meeting?';
const CRITERIA = 'Resolves YES if the FOMC lowers the target range at the December meeting.';

/**
 * Holds the live contract engine and re-renders on every state change.
 *
 * The engine mutates in place (it owns a `CircuitContext` that each circuit call
 * replaces), so a version counter drives re-renders rather than cloning state.
 */
export function useMarket() {
  const engineRef = useRef<MarketEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new MarketEngine(QUESTION, CRITERIA);
  }
  const engine = engineRef.current;

  const [version, setVersion] = useState(0);
  const [actorId, setActorId] = useState<string>('whale');
  const [flash, setFlash] = useState<{ ok: boolean; detail: string } | null>(null);

  const actor = useMemo(
    () => IDENTITIES.find((i) => i.id === actorId) ?? IDENTITIES[0],
    [actorId],
  );

  const after = useCallback((res: { ok: boolean; detail: string }) => {
    setFlash(res);
    setVersion((v) => v + 1);
    return res;
  }, []);

  const commit = useCallback(
    (side: Side, stake: bigint) => after(engine.commit(actor, side, stake)),
    [engine, actor, after],
  );

  const closeMarket = useCallback(
    (as: Identity = actor) => after(engine.closeMarket(as)),
    [engine, actor, after],
  );

  const reveal = useCallback(
    (positionId: bigint, override?: { stake?: bigint; salt?: Uint8Array }) =>
      after(engine.reveal(actor, positionId, override)),
    [engine, actor, after],
  );

  const resolve = useCallback(
    (outcome: Side) => after(engine.resolve(actor, outcome)),
    [engine, actor, after],
  );

  const claim = useCallback(
    (positionId: bigint) => after(engine.claim(actor, positionId)),
    [engine, actor, after],
  );

  const reset = useCallback(() => {
    engineRef.current = new MarketEngine(QUESTION, CRITERIA);
    setFlash(null);
    setVersion((v) => v + 1);
  }, []);

  // Recomputed on every version bump; the engine reads straight off the ledger.
  const snapshot = useMemo(
    () => ({
      ledger: engine.ledger,
      positions: engine.positions(),
      log: [...engine.log],
      notes: engine.notesFor(actor.id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, actor.id, version],
  );

  return {
    engine,
    actor,
    setActorId,
    identities: IDENTITIES,
    flash,
    ...snapshot,
    commit,
    closeMarket,
    reveal,
    resolve,
    claim,
    reset,
  };
}
