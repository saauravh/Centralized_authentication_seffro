import { CentralUser, CreateUserInput, UserPublic } from '../models/User';
export declare class UserRepository {
    findByEmail(email: string): Promise<CentralUser | null>;
    findById(id: number): Promise<CentralUser | null>;
    create(input: CreateUserInput): Promise<CentralUser>;
    updateLastLogin(id: number): Promise<void>;
    verifyEmail(id: number): Promise<void>;
    updatePassword(id: number, newPassword: string): Promise<void>;
    comparePassword(plain: string, hashed: string): Promise<boolean>;
    toPublic(user: CentralUser): UserPublic;
}
//# sourceMappingURL=UserRepository.d.ts.map