import jwt from 'jsonwebtoken';
import { config } from '../config';
import { loadJwtKeys } from '../config/jwt';
import { v4 as uuidv4 } from 'uuid';

interface SeffroJwtPayload {
  iss: string;
  sub: number;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  iat: number;
  exp: number;
  jti: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class TokenService {
  private privateKey: string;
  private publicKey: string;

  constructor() {
    const keys = loadJwtKeys();
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;
  }

  generateAccessToken(user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    email_verified: number;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: SeffroJwtPayload = {
      iss: config.jwt.issuer,
      sub: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      email_verified: user.email_verified === 1,
      iat: now,
      exp: now + config.jwt.accessTtl,
      jti: uuidv4(),
    };

    return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
  }

  verifyAccessToken(token: string): SeffroJwtPayload {
    try {
      const decoded = jwt.verify(token, this.publicKey, {
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

  getPublicKey(): string {
    return this.publicKey;
  }

  getJwks(): { keys: any[] } {
    const pubKey = this.publicKey;
    const pemLines = pubKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\n/g, '');
    const buf = Buffer.from(pemLines, 'base64');

    const modulusStart = 25; // ASN.1 offset for RSA public key
    const modulusLength = buf.readUInt32BE(modulusStart + 1);
    const modulus = buf.subarray(modulusStart + 5, modulusStart + 5 + modulusLength);

    const expStart = modulusStart + 5 + modulusLength + 4;
    const exponentLength = buf[expStart - 1];
    const exponent = buf.subarray(expStart, expStart + exponentLength);

    return {
      keys: [
        {
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: 'key-2026-01',
          n: this.base64url(modulus),
          e: this.base64url(exponent),
        },
      ],
    };
  }

  private base64url(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
