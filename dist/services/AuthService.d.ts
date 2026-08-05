import { UserRepository } from '../repositories/UserRepository';
import { TokenRepository } from '../repositories/TokenRepository';
import { AuthTokenRepository } from '../repositories/AuthTokenRepository';
import { SsoTicketRepository } from '../repositories/SsoTicketRepository';
import { LoginHistoryRepository, RequestContext } from '../repositories/LoginHistoryRepository';
import { RevocationRepository } from '../repositories/RevocationRepository';
import { TokenService } from './TokenService';
import { EmailService } from './EmailService';
import { UserPublic, CreateUserInput } from '../models/User';
export interface AuthResult {
    user: UserPublic;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
/** Outcome of a successful registration. Carries no session — see register(). */
export interface RegistrationResult {
    centralUserId: number;
    verificationRequired: boolean;
}
/** Returned by register() when the email already has a central identity. */
export interface ExistingIdentity {
    userExists: true;
}
export declare function isExistingIdentity(result: RegistrationResult | ExistingIdentity): result is ExistingIdentity;
export interface ValidationResult {
    valid: boolean;
    user?: UserPublic;
    reason?: 'invalid_token' | 'token_revoked' | 'account_inactive' | 'email_unverified';
}
export declare class AuthService {
    private userRepo;
    private tokenRepo;
    private tokenService;
    private authTokenRepo;
    private emailService;
    private historyRepo;
    private revocationRepo;
    private ssoTicketRepo;
    constructor(userRepo: UserRepository, tokenRepo: TokenRepository, tokenService: TokenService, authTokenRepo: AuthTokenRepository, emailService: EmailService, historyRepo: LoginHistoryRepository, revocationRepo: RevocationRepository, ssoTicketRepo: SsoTicketRepository);
    /**
     * Creates a central identity. Deliberately issues no session.
     *
     * Registration and authentication are separate steps. If registration returned
     * a token, a user could sign up and use the account indefinitely without ever
     * opening the verification email, and REQUIRE_EMAIL_VERIFICATION would be
     * trivially bypassable. The caller sends the user to log in, which is the one
     * path that issues a session and the one place verification is enforced.
     *
     * When the address is already registered this is not an error — the same person
     * may be signing up on a second application. The response says only that the
     * identity exists: the central id is withheld because nothing here has proved
     * the caller owns that address, and an id would let an application link a local
     * record to a stranger's identity.
     */
    register(input: CreateUserInput, ctx?: RequestContext): Promise<RegistrationResult | ExistingIdentity>;
    login(email: string, password: string, device?: string, ctx?: RequestContext): Promise<AuthResult>;
    /**
     * Full validation, as opposed to a signature check.
     *
     * Local RS256 verification in each application is fast but cannot see anything
     * that happened after the token was signed. This asks the source of truth: is
     * the signature good, has this token been revoked, has every token for this
     * user been revoked, and is the account still active? Use it on privileged
     * actions and on a periodic revalidation tick, not on every page load.
     */
    validateToken(accessToken: string): Promise<ValidationResult>;
    /**
     * Updates the identity fields this service owns, so a change made in one
     * application is visible to all of them.
     *
     * A new email address is treated as unverified until proven: it resets
     * email_verified and sends a fresh verification mail. Otherwise a user could
     * move their account to an address they do not control and keep a verified
     * badge.
     */
    updateProfile(userId: number, changes: {
        first_name?: string;
        last_name?: string;
        phone?: string | null;
        email?: string;
        avatar?: string | null;
        role?: string;
    }, ctx?: RequestContext): Promise<UserPublic>;
    /** Ends every session a user holds. Used for bans and forced sign-out. */
    revokeAllSessions(userId: number, ctx?: RequestContext): Promise<void>;
    refresh(refreshToken: string, ctx?: RequestContext): Promise<AuthResult>;
    verifyToken(accessToken: string): Promise<UserPublic>;
    /**
     * Ends a session.
     *
     * Revoking the refresh token stops renewal, but the access token already in
     * hand stays cryptographically valid until it expires. Blacklisting its jti
     * closes that window, which matters on shared machines where "log out" has to
     * mean the session is over now, not in fifteen minutes.
     */
    logout(refreshToken: string, accessToken?: string, ctx?: RequestContext): Promise<void>;
    changePassword(userId: number, currentPassword: string, newPassword: string, ctx?: RequestContext): Promise<void>;
    /**
     * Always resolves, whether or not the address is registered — the response is
     * identical either way so this endpoint cannot be used to enumerate accounts.
     */
    forgotPassword(email: string, ctx?: RequestContext): Promise<void>;
    /**
     * Redeems a reset token. The token alone determines which account is affected;
     * the email is only cross-checked so a token cannot be replayed against a
     * different address than the one it was mailed to.
     */
    resetPassword(email: string, token: string, newPassword: string, ctx?: RequestContext): Promise<void>;
    verifyEmail(email: string, token: string, ctx?: RequestContext): Promise<UserPublic>;
    /** Silent for unknown or already-verified addresses, same rationale as forgotPassword. */
    resendVerification(email: string): Promise<void>;
    /**
     * Mints a single-use ticket another application can redeem for a session.
     *
     * Used for cross-domain SSO: a user logged into one application is redirected
     * to a second one, which presents the ticket to redeemSsoTicket and receives a
     * fresh session without the user typing a password again. The ticket is bound
     * to the application it was minted for and lasts barely a minute, so a captured
     * URL is worthless.
     */
    createSsoTicket(userId: number, target: string, ctx?: RequestContext): Promise<{
        token: string;
        expiresIn: number;
    }>;
    /**
     * Redeems a ticket issued by createSsoTicket for a fresh session.
     *
     * The ticket alone determines which account is affected, so a token cannot be
     * replayed against a different person; the presented application must also be
     * the one the ticket was minted for, so a ticket torn out of one redirect URL
     * cannot start a session anywhere else.
     */
    redeemSsoTicket(token: string, app: string, ctx?: RequestContext): Promise<AuthResult>;
    private issueVerificationEmail;
    private issueTokens;
}
//# sourceMappingURL=AuthService.d.ts.map