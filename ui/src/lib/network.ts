/**
 * Public Midnight endpoints, by network.
 *
 * Deliberately duplicated from `cli/src/config.ts` rather than imported: the
 * CLI is a separate package with its own dependency tree, and pulling it into
 * the browser bundle to share four template strings would be a worse trade than
 * writing them twice. The shape is fixed by Midnight, not by us.
 *
 * These are for READS only. Anything that spends -- proving, balancing,
 * submitting -- goes through Lace, which supplies its own endpoints via
 * `getConfiguration()` and is the authority on them. The indexer, by contrast,
 * is public: querying a contract's state needs no wallet, no key and no
 * permission, which is what lets the landing page show real on-chain numbers to
 * someone who has installed nothing.
 */

export type NetworkName = 'preview' | 'preprod';

const KNOWN: readonly string[] = ['preview', 'preprod'];

/** The configured network, falling back to preview if unset or unrecognised. */
export const networkName = (): NetworkName => {
  const raw = (import.meta.env.VITE_NETWORK_ID ?? 'preview').trim();
  return KNOWN.includes(raw) ? (raw as NetworkName) : 'preview';
};

export const indexerUrls = (network: NetworkName = networkName()) => ({
  http: `https://indexer.${network}.midnight.network/api/v4/graphql`,
  ws: `wss://indexer.${network}.midnight.network/api/v4/graphql/ws`,
});
