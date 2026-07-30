import { RefreshToken } from '../models/RefreshToken';
export declare class TokenRepository {
    generateRefreshToken(): string;
    hashToken(token: string): string;
    create(userId: number, tokenHash: string, device: string | null, ttlSeconds: number): Promise<void>;
    findByHash(tokenHash: string): Promise<RefreshToken | null>;
    revoke(tokenHash: string): Promise<void>;
    revokeAllForUser(userId: number): Promise<void>;
}
//# sourceMappingURL=TokenRepository.d.ts.map