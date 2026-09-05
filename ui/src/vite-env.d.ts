/// <reference types="vite/client" />

/**
 * Vite's own `ImportMetaEnv` carries an index signature, so every `VITE_*` key
 * type-checks as `any`. Declaring the vars we actually read gives them a real
 * type -- `string | undefined` rather than `any` -- so callers are forced to
 * handle the unset case.
 *
 * It does NOT catch misspelled keys: this interface merges with vite/client's,
 * and the index signature there still resolves unknown names to `any`. Removing
 * that would mean dropping the `vite/client` reference and losing the asset and
 * HMR types with it, which is a worse trade. The runtime guard in
 * `zk-config.ts` is what actually validates the value.
 */
interface ImportMetaEnv {
  /** Public HTTPS URL of a Midnight proof server. See src/lib/zk-config.ts. */
  readonly VITE_PROOF_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
