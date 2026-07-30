import fs from 'fs';
import path from 'path';
import { config } from './index';

export function loadJwtKeys(): { privateKey: string; publicKey: string } {
  const privateKeyPath = path.resolve(config.jwt.privateKeyPath);
  const publicKeyPath = path.resolve(config.jwt.publicKeyPath);

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    console.error('JWT keys not found. Run: npm run generate-keys');
    process.exit(1);
  }

  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

  return { privateKey, publicKey };
}
