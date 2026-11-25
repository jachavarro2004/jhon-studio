/**
 * src/version.ts — the one source of jhon-studio's version and of what a release promises.
 *
 * `jhon-studio --version` prints VERSION and `jhon-studio integration --json` gives every constant
 * here but the signer's. The tests hold the copies to these values: plugin/claude-code's
 * plugin.json, README's install lines, its required-jhon text and its integration example, the
 * CHANGELOG's section for VERSION, and .github/workflows/release.yml (which also refuses a tag that
 * is not v<VERSION>).
 */

/** The version: SemVer, X.Y.Z or X.Y.Z-rc.N (the release tag is v<VERSION>). */
export const VERSION = "0.1.0-rc.1";

/** The schema of `jhon-studio integration --json`'s own JSON. */
export const SCHEMA = "jhon-studio.integration/v1";

/** The contract that answer speaks to jhon (jhon's integrations/README.md). */
export const CONTRACT = "jhon.integration/v1";

/**
 * The jhon versions this release runs with: a SemVer range in the syntax jhon reads (>=, >, <=,
 * <, = on full x.y.z versions; spaces AND, `||` OR; no ^, ~ or x).
 */
export const REQUIRES_JHON = ">=0.5.0-rc.1";

/** The GitHub repository the releases come from. */
export const REPOSITORY = "jachavarro2004/jhon-studio";

/** Who signs a release (cosign keyless): GitHub's OIDC issuer, and the release workflow at a release tag. */
export const SIGNER_ISSUER = "https://token.actions.githubusercontent.com";
export const SIGNER_IDENTITY = String.raw`^https://github\.com/jachavarro2004/jhon-studio/\.github/workflows/release\.yml@refs/tags/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-rc\.(0|[1-9]\d*))?$`;
