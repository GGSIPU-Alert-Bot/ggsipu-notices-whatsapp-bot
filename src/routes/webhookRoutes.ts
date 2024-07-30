import express from 'express';
import crypto from 'crypto';
import { verifySignature } from '../services/webhookService';
import { wahaService } from '../services/wahaService';
import { Notice } from '../models/Notice';
import logger from '../utils/logger';

const router = express.Router();

router.post('/', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    logger.debug('Received signature:', signature);

    if (!signature || typeof signature !== 'string') {
      logger.warn('No signature or invalid signature type provided');
      return res.status(400).send('No signature or invalid signature type provided');
    }

    const payload = JSON.stringify(req.body);
    if (!payload) {
      logger.warn('Empty request body');
      return res.status(400).send('Empty request body');
    }

    if (!verifySignature(payload, signature)) {
      logger.warn('Invalid signature');
      return res.status(401).send('Invalid signature');
    }

    const notice: Notice = req.body;
    if (!isValidNotice(notice)) {
      logger.warn('Invalid notice format', notice);
      return res.status(400).send('Invalid notice format');
    }

    await wahaService.broadcastNotice(notice);
    
    logger.info('Webhook processed successfully');
    res.sendStatus(200);
  } catch (error) {
    logger.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

function isValidNotice(notice: any): notice is Notice {
  return (
    typeof notice === 'object' &&
    notice !== null &&
    typeof notice.id === 'number' &&
    typeof notice.title === 'string' &&
    typeof notice.date === 'string' &&
    typeof notice.url === 'string'
  );
}

export default router;