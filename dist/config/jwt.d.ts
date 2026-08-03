/**
 * Stands in for the absent `kid` on tokens minted before rotation support.
 * Never appears in a JWT header — see TokenService.
 */
export declare const LEGACY_KID = "__legacy__";
export interface KeySet {
    /** kid of the key new tokens are signed with. */
    activeKid: string;
    /** Private key for the active kid. Only one is ever loaded. */
    privateKey: string;
    /** Every public key we still trust, by kid. */
    publicKeys: Map<string, string>;
}
/**
 * Layout:
 *
 *   keys/
 *     active.key             ← contains the active kid, e.g. "2026-08"
 *     private-2026-08.pem
 *     public-2026-08.pem
 *     public-2026-02.pem     ← retired, still trusted until its tokens expire
 *
 * Retaining old *public* keys is the point of the arrangement. During a rotation,
 * tokens signed by the previous key are still in circulation for up to one
 * access-token lifetime; keeping their public half lets those verify until they
 * expire, so a rotation is a deploy rather than a forced logout.
 *
 * Delete a retired public key once nothing it signed is still live — which is
 * also how you stop trusting a compromised key.
 */
export declare function loadKeySet(): KeySet;
//# sourceMappingURL=jwt.d.ts.map