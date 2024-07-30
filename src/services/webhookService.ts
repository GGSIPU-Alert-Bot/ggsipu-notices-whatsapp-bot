import crypto from 'crypto';
import { config } from '../config/config';
import logger from '../utils/logger';

export function verifySignature(payload: string, signature: string): boolean {
  try {
    if (!payload || !signature) {
      logger.warn('Empty payload or signature');
      return false;
    }

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', config.webhookSecret)
      .update(payload)
      .digest('hex');

    logger.debug('Expected signature:', expectedSignature);
    logger.debug('Received signature:', signature);

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch (error) {
    logger.error('Error verifying signature:', error);
    return false;
  }
}