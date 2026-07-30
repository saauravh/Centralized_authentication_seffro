export interface CentralUser {
  id: number;
  email: string;
  phone: string | null;
  password: string;
  first_name: string;
  last_name: string;
  email_verified: number;
  status: 'active' | 'suspended' | 'banned';
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
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email_verified: boolean;
  status: string;
}
