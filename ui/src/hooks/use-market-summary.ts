import { useEffect, useState } from 'react';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { Phase, ledger, type Ledger } from '@/lib/live-contract';
import { liveContractAddress } from '@/lib/live-providers';
import { indexerUrls, networkName } from '@/lib/network';

export type MarketSummary = {
  contractAddress: string;
  phase: Phase;
  yesPositions: number;
  noPositions: number;
  /** Only non-zero once resolved; before that the chain does not know it. */
  pool: bigint;
  winningSide: 'YES' | 'NO' | null;
};

const summarise = (contractAddress: string, state: Ledger): MarketSummary => ({
  contractAddress,
  phase: state.phase,
  yesPositions: Number(state.yesCount),
  noPositions: Number(state.noCount),
  pool: state.pool,
  winningSide: state.winningSide.is_some ? (state.winningSide.value === 0 ? 'YES' : 'NO') : null,
});

/**
 * The deployed market's real public state, read straight from the indexer.
 *
 * No wallet, no proof server, no user action: contract state is public, so the
 * landing page can show what the chain actually holds to a visitor who has
 * installed nothing. That is the difference between claiming a contract is
 * deployed and showing it.
 *
 * Returns null while loading, and on any failure. A landing page must render
 * with or without the network, so an unreachable indexer degrades to the
 * illustrative copy rather than to an error.
 */
export function useMarketSummary(): MarketSummary | null {
  const [summary, setSummary] = useState<MarketSummary | null>(null);

  useEffect(() => {
    const address = liveContractAddress();
    if (address === null) return;

    let cancelled = false;
    const urls = indexerUrls();
    // The indexer's responses are decoded against the configured network, so
    // this has to be set before the first query or the state fails to parse.
    setNetworkId(networkName());

    void (async () => {
      try {
        const provider = indexerPublicDataProvider(urls.http, urls.ws, WebSocket);
        const state = await provider.queryContractState(address);
        if (cancelled || state === null) return;
        setSummary(summarise(address, ledger(state.data)));
      } catch {
        // Offline, blocked, or the address is not on this network. The cards
        // fall back to their illustrative figures, which is a fine landing page.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return summary;
}
