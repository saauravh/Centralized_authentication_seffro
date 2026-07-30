import { UserRepository } from '../repositories/UserRepository';
import { TokenRepository } from '../repositories/TokenRepository';
import { TokenService } from './TokenService';
import { UserPublic, CreateUserInput } from '../models/User';
export interface AuthResult {
    user: UserPublic;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export declare class AuthService {
    private userRepo;
    private tokenRepo;
    private tokenService;
    constructor(userRepo: UserRepository, tokenRepo: TokenRepository, tokenService: TokenService);
    register(input: CreateUserInput): Promise<UserPublic>;
    login(email: string, password: string, device?: string): Promise<AuthResult>;
    refresh(refreshToken: string): Promise<AuthResult>;
    verifyToken(accessToken: string): Promise<UserPublic>;
    logout(refreshToken: string): Promise<void>;
    changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void>;
    forgotPassword(email: string): Promise<void>;
    resetPassword(email: string, token: string, newPassword: string): Promise<void>;
    private sendVerificationEmail;
    private sendPasswordResetEmail;
}
//# sourceMappingURL=AuthService.d.ts.map