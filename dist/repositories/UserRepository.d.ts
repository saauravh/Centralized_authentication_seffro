import { CentralUser, CreateUserInput, UserPublic } from '../models/User';
export declare class UserRepository {
    findByEmail(email: string): Promise<CentralUser | null>;
    findById(id: number): Promise<CentralUser | null>;
    /** Lookup by the public identifier, for anything that came from outside. */
    findByUuid(uuid: string): Promise<CentralUser | null>;
    create(input: CreateUserInput): Promise<CentralUser>;
    /**
     * Failed-login bookkeeping for account lockout.
     *
     * Persisted rather than held in the in-memory rate limiter so a lockout
     * survives a restart and is visible to support staff looking at the account.
     */
    recordFailedLogin(id: number, threshold: number, lockSeconds: number): Promise<void>;
    clearFailedLogins(id: number): Promise<void>;
    isLocked(user: CentralUser): boolean;
    updateLastLogin(id: number): Promise<void>;
    verifyEmail(id: number): Promise<void>;
    /**
     * Partial update of the identity fields this service owns.
     *
     * Columns are whitelisted here rather than derived from the input keys — the
     * caller passes a request-shaped object, and interpolating its keys into SQL
     * would let a client write to `password` or `status`.
     */
    updateProfile(id: number, changes: {
        first_name?: string;
        last_name?: string;
        phone?: string | null;
        email?: string;
        avatar?: string | null;
        email_verified_at?: Date | null;
        role?: string;
    }): Promise<CentralUser>;
    updatePassword(id: number, newPassword: string): Promise<void>;
    comparePassword(plain: string, hashed: string): Promise<boolean>;
    toPublic(user: CentralUser): UserPublic;
}
//# sourceMappingURL=UserRepository.d.ts.map