/**
 * Market copy for the landing page.
 *
 * Exactly one of these is real: the entry flagged `live` is the market this
 * build has deployed, and its counts and phase are replaced at runtime by a
 * query against the indexer (`useMarketSummary`). The rest are illustrative,
 * are labelled as such on the card, and lead to the in-browser simulation.
 *
 * Note that the question text lives here rather than on-chain. The contract
 * stores no question: one deployed contract IS one market, and what it is a
 * market *about* is an agreement between the resolver and the participants,
 * published off-chain. Putting the string on-chain would cost gas to say
 * something the resolver could contradict anyway.
 *
 * Note what is and is not in this shape: there is no `volume` and no `price`.
 * That is deliberate. On Darkstake the only public aggregate is how many
 * positions exist on each side; the amounts stay shielded until settlement, so
 * there is nothing to compute a price from. Anything resembling a dollar figure
 * here would be a lie about the product.
 */

export type Side = 'YES' | 'NO';
export type Phase = 'OPEN' | 'REVEAL' | 'RESOLVED';

export interface Market {
  id: string;
  question: string;
  category: string;
  /** Plain-language criteria the resolver commits to in advance. */
  resolution: string;
  /** Where the resolver will look. */
  source: string;
  closesAt: string;
  phase: Phase;
  /**
   * True for the one market backed by a deployed contract. Its figures below
   * are placeholders that the live query overwrites -- they show only when the
   * indexer cannot be reached.
   */
  live?: boolean;
  /** Public: how many positions sit on each side. Never how large they are. */
  yesPositions: number;
  noPositions: number;
  winningSide?: Side;
}

export const CATEGORIES = [
  'All',
  'Crypto',
  'Economics',
  'Tech',
  'Climate',
  'Science',
  'Sports',
] as const;

export const MARKETS: Market[] = [
  {
    id: 'btc-150k',
    question: 'Will Bitcoin close above $150,000 on 31 Dec 2026?',
    category: 'Crypto',
    resolution: 'Resolves YES if the daily close on 31 Dec 2026 UTC exceeds $150,000.',
    source: 'Coinbase BTC-USD daily close',
    closesAt: '31 Dec 2026',
    phase: 'OPEN',
    yesPositions: 312,
    noPositions: 268,
  },
  {
    id: 'fed-cut-dec',
    question: 'Will the Federal Reserve cut rates at the December 2026 meeting?',
    category: 'Economics',
    resolution: 'Resolves YES if the FOMC lowers the target range at the December meeting.',
    source: 'FOMC statement',
    closesAt: '16 Dec 2026',
    phase: 'OPEN',
    live: true,
    yesPositions: 0,
    noPositions: 0,
  },
  {
    id: 'starship-refuel',
    question: 'Will Starship complete an orbital propellant transfer before 2027?',
    category: 'Science',
    resolution: 'Resolves YES on confirmed ship-to-ship transfer in orbit before 1 Jan 2027.',
    source: 'SpaceX official confirmation',
    closesAt: '31 Dec 2026',
    phase: 'OPEN',
    yesPositions: 96,
    noPositions: 341,
  },
  {
    id: 'eth-etf-staking',
    question: 'Will a US spot ETH ETF be approved for staking by Q2 2027?',
    category: 'Crypto',
    resolution: 'Resolves YES on SEC approval of staking within any US spot ETH ETF.',
    source: 'SEC filings',
    closesAt: '30 Jun 2027',
    phase: 'OPEN',
    yesPositions: 205,
    noPositions: 233,
  },
  {
    id: 'warmest-year',
    question: 'Will 2026 be recorded as the warmest year on record?',
    category: 'Climate',
    resolution: 'Resolves YES if the NASA GISTEMP annual anomaly exceeds every prior year.',
    source: 'NASA GISTEMP annual report',
    closesAt: '31 Jan 2027',
    phase: 'OPEN',
    yesPositions: 388,
    noPositions: 142,
  },
  {
    id: 'frontier-model',
    question: 'Will a frontier lab ship a model with a 10M-token context window in 2026?',
    category: 'Tech',
    resolution: 'Resolves YES on any generally-available model documenting a 10M+ token window.',
    source: 'Official model documentation',
    closesAt: '31 Dec 2026',
    phase: 'REVEAL',
    yesPositions: 274,
    noPositions: 118,
  },
  {
    id: 'wc-qualify',
    question: 'Will the host nation reach the 2026 World Cup quarter-finals?',
    category: 'Sports',
    resolution: 'Resolves YES if the team advances past the round of 16.',
    source: 'FIFA official results',
    closesAt: '11 Jul 2026',
    phase: 'RESOLVED',
    yesPositions: 157,
    noPositions: 402,
    winningSide: 'NO',
  },
  {
    id: 'inflation-under-3',
    question: 'Will US CPI year-over-year print below 3% for Nov 2026?',
    category: 'Economics',
    resolution: 'Resolves YES if the BLS headline CPI YoY for November 2026 is under 3.0%.',
    source: 'BLS CPI release',
    closesAt: '12 Dec 2026',
    phase: 'OPEN',
    yesPositions: 349,
    noPositions: 301,
  },
];
