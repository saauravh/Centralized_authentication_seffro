import jwt from 'jsonwebtoken';
import { config } from '../config';
import { loadKeySet, KeySet, LEGACY_KID } from '../config/jwt';
import { v4 as uuidv4 } from 'uuid';

interface SeffroJwtPayload {
  iss: string;
  sub: number;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  role: string;
  iat: number;
  exp: number;
  jti: string;
}

export class TokenService {
  private keys: KeySet;

  constructor() {
    this.keys = loadKeySet();
  }

  generateAccessToken(user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    email_verified_at: Date | null;
    role: string;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: SeffroJwtPayload = {
      iss: config.jwt.issuer,
      sub: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      email_verified: user.email_verified_at !== null,
      role: user.role,
      iat: now,
      exp: now + config.jwt.accessTtl,
      jti: uuidv4(),
    };

    return jwt.sign(payload, this.keys.privateKey, {
      algorithm: 'RS256',
      // The internal placeholder never goes on the wire — a token from the
      // pre-rotation layout stays header-less, exactly as it was before.
      ...(this.keys.activeKid === LEGACY_KID ? {} : { keyid: this.keys.activeKid }),
    });
  }

  /**
   * Verifies against the key the token names.
   *
   * `kid` selects which of our public keys to try — it is a lookup, not a
   * credential. An unrecognised or absent kid falls back to the single trusted
   * key when there is exactly one, which is what lets tokens minted before
   * rotation survive the cutover; with several keys loaded, a token that names
   * none of them is rejected rather than tried against each in turn.
   */
  verifyAccessToken(token: string): SeffroJwtPayload {
    const key = this.publicKeyFor(token);

    if (!key) {
      throw new Error('Invalid token');
    }

    try {
      const decoded = jwt.verify(token, key, {
        algorithms: ['RS256'],
        issuer: config.jwt.issuer,
      });
      return decoded as unknown as SeffroJwtPayload;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      throw new Error('Invalid token');
    }
  }

  private publicKeyFor(token: string): string | null {
    const kid = readKid(token);

    if (kid) {
      return this.keys.publicKeys.get(kid) ?? null;
    }

    // No kid: either a pre-rotation token, or a forged header. Only unambiguous
    // when we trust exactly one key.
    if (this.keys.publicKeys.size === 1) {
      return [...this.keys.publicKeys.values()][0];
    }

    return this.keys.publicKeys.get(LEGACY_KID) ?? null;
  }

  /** kid of the key currently signing tokens. Exposed for diagnostics. */
  getActiveKid(): string {
    return this.keys.activeKid;
  }

  /**
   * The apps verify tokens with these, deployed as CENTRAL_AUTH_PUBLIC_KEYS.
   * There is no JWKS endpoint: JWKS exists so unknown third-party clients can
   * discover a key, and every consumer here is one of ours, configured at
   * deploy time.
   */
  getPublicKeys(): Record<string, string> {
    return Object.fromEntries(this.keys.publicKeys);
  }
}

/** Reads the kid from the JWT header without verifying anything. */
function readKid(token: string): string | null {
  const segment = token.split('.')[0];
  if (!segment) return null;

  try {
    const header = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return typeof header.kid === 'string' ? header.kid : null;
  } catch {
    return null;
  }
}
