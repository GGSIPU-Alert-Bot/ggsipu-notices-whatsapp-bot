import crypto from 'crypto';
import { config } from '../config/config';

export function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha1', config.webhookSecret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}