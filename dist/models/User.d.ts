export interface CentralUser {
    id: number;
    /** Public identifier. Prefer this anywhere a value leaves the server-to-server channel. */
    uuid: string;
    email: string;
    phone: string | null;
    password: string;
    first_name: string;
    last_name: string;
    avatar: string | null;
    /** Null until verified. Carries when, which the boolean form could not. */
    email_verified_at: Date | null;
    status: 'active' | 'suspended' | 'banned';
    failed_login_attempts: number;
    locked_until: Date | null;
    /** Access tokens issued before this instant are refused. Null means none revoked. */
    tokens_valid_from: Date | null;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
export interface CreateUserInput {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
}
export interface UserPublic {
    id: number;
    uuid: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    avatar: string | null;
    email_verified: boolean;
    email_verified_at: Date | null;
    status: string;
}
//# sourceMappingURL=User.d.ts.map