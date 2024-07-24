import dotenv from 'dotenv';

dotenv.config();

export const config = {
  webhookSecret: process.env.WEBHOOK_SECRET!,
  wahaApiUrl: process.env.WAHA_API_URL || 'http://localhost:3000',
  wahaSessionName: process.env.WAHA_SESSION_NAME || 'default',
  whatsappGroupIds: process.env.WHATSAPP_GROUP_IDS!.split(','),
  port: parseInt(process.env.PORT || '9000', 10)
};