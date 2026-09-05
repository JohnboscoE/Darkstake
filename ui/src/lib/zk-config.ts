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

/**
 * The proof server URL, or null when none is configured.
 *
 * Set `VITE_PROOF_SERVER_URL` in `ui/.env.local` (gitignored). In the
 * devcontainer, `.devcontainer/tunnel.sh` prints a public HTTPS URL for the
 * local proof server and tells you the exact line to add.
 *
 * Returns null rather than throwing when unset: no proof server is the normal
 * state of this demo, not an error. It throws only on a value that is set but
 * unusable, because a typo'd URL should not look identical to no URL at all.
 */
/** Hosts the browser treats as secure even over plain http. */
const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]' ||
  hostname === '::1' ||
  hostname.endsWith('.localhost');

export const getProofServerUrl = (): string | null => {
  const raw = import.meta.env.VITE_PROOF_SERVER_URL;
  if (typeof raw !== 'string' || raw.trim() === '') return null;

  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`VITE_PROOF_SERVER_URL is not a valid URL: ${JSON.stringify(value)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`VITE_PROOF_SERVER_URL must be http(s), got ${parsed.protocol}`);
  }
  // A page served over https cannot call a plaintext http proof server --
  // browsers block it as mixed content, with a console error that does not
  // obviously point here. Say so at config time instead.
  //
  // Loopback is the exception, and it is the important one: browsers treat
  // http://localhost and http://127.0.0.1 as potentially trustworthy origins,
  // so an https page CAN reach a proof server on localhost. That is exactly the
  // setup this project expects -- a hosted site talking to the proof server on
  // the visitor's own machine -- and rejecting it here would break the normal
  // case in the name of a rule that does not apply to it.
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    parsed.protocol === 'http:' &&
    !isLoopback(parsed.hostname)
  ) {
    throw new Error(
      `VITE_PROOF_SERVER_URL is http:// on a non-loopback host but this page is https:// -- the browser will block it as mixed content. Use an https tunnel (see .devcontainer/tunnel.sh), or point it at localhost.`,
    );
  }
  return value.replace(/\/$/, '');
};

/**
 * Whether a proof server is configured at all.
 *
 * Without one the demo runs circuits unproven in memory, which is what
 * `market-engine.ts` does today. Keys alone do not change that: a proving key
 * is an input to a prover, and the prover is the proof server.
 */
export const hasProofServer = (): boolean => {
  try {
    return getProofServerUrl() !== null;
  } catch {
    return false;
  }
};

export type ProofServerProbe = {
  url: string;
  reachable: boolean;
  status: number | null;
  detail: string;
};

/**
 * Liveness hint for the configured proof server.
 *
 * Deliberately only a GET on the base URL: this checks that *something*
 * answers, not that it speaks the proving protocol. Any status counts as
 * reachable, since the root path is not part of the API and a 404 from the
 * real server still proves the tunnel and the container are up.
 */
export const probeProofServer = async (
  url: string | null = getProofServerUrl(),
  fetchFunc: typeof fetch = fetch,
): Promise<ProofServerProbe | null> => {
  if (url === null) return null;
  try {
    const response = await fetchFunc(url, { method: 'GET' });
    return {
      url,
      reachable: true,
      status: response.status,
      detail: `answered ${response.status} ${response.statusText}`.trim(),
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      status: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

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
