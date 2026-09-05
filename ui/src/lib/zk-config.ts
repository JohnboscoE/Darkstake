/**
 * Serving the real proving keys to the browser.
 *
 * `FetchZkConfigProvider` fetches ZK artifacts over HTTP from a base URL, using
 * a fixed layout that `public/` mirrors exactly:
 *
 *   <base>/keys/<circuit>.prover      the proving key
 *   <base>/keys/<circuit>.verifier    the verifying key
 *   <base>/zkir/<circuit>.bzkir       the BINARY zkir -- not the .zkir text form
 *
 * Those files come from `contract/managed/prediction-market/`, which is built by
 * the `proving-keys` GitHub workflow. They cannot be generated on the dev
 * machine: `zkir` needs the bmi2/adx instructions and this CPU is a 2011 Sandy
 * Bridge, so a local `compact compile` without `--skip-zk` dies with SIGILL.
 * Copy them in with:
 *
 *   cp contract/managed/prediction-market/keys/*.prover   ui/public/keys/
 *   cp contract/managed/prediction-market/keys/*.verifier ui/public/keys/
 *   cp contract/managed/prediction-market/zkir/*.bzkir    ui/public/zkir/
 *
 * WHAT THIS DOES NOT DO: keys are an *input to a prover*, not a prover. This
 * provider hands artifacts to `httpClientProofProvider`, which sends them to a
 * proof server. Until a proof server URL exists, having the keys served changes
 * nothing observable -- the demo still runs circuits unproven in memory, which
 * is what `market-engine.ts` does. This module is the half of the wiring that
 * does not depend on that decision.
 */
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';

/** The five circuits that produce proofs. Pure circuits need no keys. */
export const PM_CIRCUIT_IDS = [
  'commitPosition',
  'closeMarket',
  'revealPosition',
  'resolve',
  'claimEntitlement',
] as const;

export type PMCircuitKeys = (typeof PM_CIRCUIT_IDS)[number];

/**
 * Builds a provider reading from this origin's `public/` directory.
 *
 * @param baseURL Defaults to the page origin. Must be http(s) -- the provider
 * rejects other schemes in its constructor.
 */
export const createZkConfigProvider = (
  baseURL: string = window.location.origin,
): FetchZkConfigProvider<PMCircuitKeys> =>
  new FetchZkConfigProvider<PMCircuitKeys>(baseURL, fetch.bind(window));

export type ArtifactCheck = {
  circuit: PMCircuitKeys;
  kind: 'prover' | 'verifier' | 'bzkir';
  url: string;
  ok: boolean;
  bytes: number;
  detail: string;
};

/**
 * Fetches every artifact and reports what actually arrived.
 *
 * Worth having as a first-class check rather than trusting the file listing: a
 * dev server that 404s to an SPA fallback returns `200 text/html` for a missing
 * key, so "the request succeeded" is not evidence the key exists. The provider
 * itself guards against exactly this, and so does this function.
 */
export const verifyZkArtifacts = async (
  baseURL: string = window.location.origin,
  fetchFunc: typeof fetch = fetch,
): Promise<ArtifactCheck[]> => {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  const targets: Array<[PMCircuitKeys, ArtifactCheck['kind'], string]> = [];
  for (const circuit of PM_CIRCUIT_IDS) {
    targets.push([circuit, 'prover', `keys/${circuit}.prover`]);
    targets.push([circuit, 'verifier', `keys/${circuit}.verifier`]);
    targets.push([circuit, 'bzkir', `zkir/${circuit}.bzkir`]);
  }

  return Promise.all(
    targets.map(async ([circuit, kind, path]): Promise<ArtifactCheck> => {
      const url = new URL(path, base).toString();
      try {
        const response = await fetchFunc(url, { method: 'GET' });
        if (!response.ok) {
          return { circuit, kind, url, ok: false, bytes: 0, detail: `${response.status} ${response.statusText}` };
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) {
          return { circuit, kind, url, ok: false, bytes: 0, detail: 'got text/html -- SPA fallback, file missing' };
        }
        const bytes = (await response.arrayBuffer()).byteLength;
        return { circuit, kind, url, ok: bytes > 0, bytes, detail: bytes > 0 ? contentType || 'ok' : 'empty body' };
      } catch (error) {
        return {
          circuit,
          kind,
          url,
          ok: false,
          bytes: 0,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
};
