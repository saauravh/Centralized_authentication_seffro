interface SeffroJwtPayload {
    iss: string;
    sub: number;
    email: string;
    first_name: string;
    last_name: string;
    email_verified: boolean;
    iat: number;
    exp: number;
    jti: string;
}
export declare class TokenService {
    private privateKey;
    private publicKey;
    constructor();
    generateAccessToken(user: {
        id: number;
        email: string;
        first_name: string;
        last_name: string;
        email_verified: number;
    }): string;
    verifyAccessToken(token: string): SeffroJwtPayload;
    getPublicKey(): string;
    getJwks(): {
        keys: any[];
    };
    private base64url;
}
export {};
//# sourceMappingURL=TokenService.d.ts.map