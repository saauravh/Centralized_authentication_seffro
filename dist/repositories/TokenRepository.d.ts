import { RefreshToken } from '../models/RefreshToken';
export declare class TokenRepository {
    /** 256 bits of CSPRNG output. Opaque to clients; only its hash is stored. */
    generateRefreshToken(): string;
    hashToken(token: string): string;
    create(userId: number, tokenHash: string, deviceName: string | null, ipAddress: string | null, ttlSeconds: number): Promise<void>;
    findByHash(tokenHash: string): Promise<RefreshToken | null>;
    revoke(tokenHash: string): Promise<void>;
    revokeAllForUser(userId: number): Promise<void>;
}
//# sourceMappingURL=TokenRepository.d.ts.map