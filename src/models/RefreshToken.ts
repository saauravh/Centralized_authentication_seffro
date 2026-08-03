export interface RefreshToken {
  id: number;
  user_id: number;
  token_hash: string;
  device_name: string | null;
  ip_address: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}
