interface SeffroJwtPayload {
    iss: string;
    sub: number;
    email: string;
    first_name: string;
    last_name: string;
    email_verified: boolean;
    role: string;
    iat: number;
    exp: number;
    jti: string;
}
export declare class TokenService {
    private keys;
    constructor();
    generateAccessToken(user: {
        id: number;
        email: string;
        first_name: string;
        last_name: string;
        email_verified_at: Date | null;
        role: string;
    }): string;
    /**
     * Verifies against the key the token names.
     *
     * `kid` selects which of our public keys to try — it is a lookup, not a
     * credential. An unrecognised or absent kid falls back to the single trusted
     * key when there is exactly one, which is what lets tokens minted before
     * rotation survive the cutover; with several keys loaded, a token that names
     * none of them is rejected rather than tried against each in turn.
     */
    verifyAccessToken(token: string): SeffroJwtPayload;
    private publicKeyFor;
    /** kid of the key currently signing tokens. Exposed for diagnostics. */
    getActiveKid(): string;
    /**
     * The apps verify tokens with these, deployed as CENTRAL_AUTH_PUBLIC_KEYS.
     * There is no JWKS endpoint: JWKS exists so unknown third-party clients can
     * discover a key, and every consumer here is one of ours, configured at
     * deploy time.
     */
    getPublicKeys(): Record<string, string>;
}
export {};
//# sourceMappingURL=TokenService.d.ts.map