export interface RefreshToken {
    id: number;
    user_id: number;
    token_hash: string;
    device: string | null;
    expires_at: Date;
    revoked: number;
    created_at: Date;
}
//# sourceMappingURL=RefreshToken.d.ts.map