import express from 'express';
import { verifySignature } from '../services/webhookService';
import { wahaService } from '../services/wahaService';
import { Notice } from '../models/Notice';

const router = express.Router();

router.post('/', express.json(), async (req, res) => {
  const signature = req.headers['x-hub-signature'] as string;
  if (!signature) {
    return res.status(400).send('No signature provided');
  }

  const [, hash] = signature.split('=');
  if (!verifySignature(JSON.stringify(req.body), hash)) {
    return res.status(401).send('Invalid signature');
  }

  const notice: Notice = req.body;
  await wahaService.broadcastNotice(notice);
  
  res.sendStatus(200);
});

export default router;