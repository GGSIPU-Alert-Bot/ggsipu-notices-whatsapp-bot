import axios from 'axios';
import { config } from '../config/config';
import { Notice } from '../models/Notice';
import logger from '../utils/logger';

interface SessionStatus {
  name: string;
  status: 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED';
  me: {
    id: string;
    pushName: string;
  } | null;
  engine: {
    engine: string;
  };
}

class WAHAService {
  private apiUrl: string;
  private sessionName: string;
  private maxQrCodeAttempts: number = 5;
  private qrCodeExpirationTime: number = 30000; // 30 seconds in milliseconds

  constructor() {
    this.apiUrl = config.wahaApiUrl;
    this.sessionName = config.wahaSessionName;
  }

  async ensureAuthenticated(): Promise<void> {
    const sessionStatus = await this.checkSessionStatus();
    if (sessionStatus.status === 'SCAN_QR_CODE') {
      await this.handleQrCodeScan();
    } else if (sessionStatus.status !== 'WORKING') {
      throw new Error(`Unexpected session status: ${sessionStatus.status}`);
    } else {
      logger.info(`Session authenticated for user: ${sessionStatus.me?.pushName}`);
    }
  }

  private async checkSessionStatus(): Promise<SessionStatus> {
    try {
      const response = await axios.get<SessionStatus>(`${this.apiUrl}/api/sessions/${this.sessionName}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // Session doesn't exist
        return {
          name: this.sessionName,
          status: 'FAILED',
          me: null,
          engine: { engine: '' }
        };
      }
      logger.error('Failed to check session status:', error);
      throw error;
    }
  }

  private async handleQrCodeScan(): Promise<void> {
    let attempts = 0;
    while (attempts < this.maxQrCodeAttempts) {
      try {
        const qrCodeData = await this.getAuthQR();
        logger.info('QR code received. Please scan it with your WhatsApp app.');
        
        this.displayQRCode(qrCodeData);

        const authenticated = await this.waitForAuthentication();
        if (authenticated) {
          logger.info('Authentication successful!');
          return;
        }
      } catch (error) {
        logger.error('Authentication attempt failed:', error);
      }
      attempts++;
      logger.info(`Retrying authentication (Attempt ${attempts} of ${this.maxQrCodeAttempts})`);
    }
    throw new Error('Failed to authenticate after multiple attempts');
  }

  private async getAuthQR(): Promise<Buffer> {
    try {
      const response = await axios.get(`${this.apiUrl}/api/${this.sessionName}/auth/qr`, {
        responseType: 'arraybuffer'
      });
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      logger.error('Failed to get authentication QR code:', error);
      throw error;
    }
  }

  private displayQRCode(qrCodeData: Buffer): void {
    // Placeholder for QR code display logic
    logger.info('QR Code data received. Implement a method to display this to the user.');
    // implement actual QR code display logic here
  }

  private async waitForAuthentication(): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < this.qrCodeExpirationTime) {
      const sessionStatus = await this.checkSessionStatus();
      if (sessionStatus.status === 'WORKING') {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
    return false;
  }

  async startSession(): Promise<void> {
    try {
      const sessionStatus = await this.checkSessionStatus();
      
      if (sessionStatus.status === 'WORKING') {
        logger.info(`Session '${this.sessionName}' is already working.`);
        return;
      }

      if (sessionStatus.status === 'STARTING' || sessionStatus.status === 'SCAN_QR_CODE') {
        logger.info(`Session '${this.sessionName}' is in ${sessionStatus.status} state. Waiting for it to be ready.`);
        await this.ensureAuthenticated();
        return;
      }

      // If the session doesn't exist or is in a failed state, try to start it
      logger.info(`Starting new session '${this.sessionName}'`);
      await axios.post(`${this.apiUrl}/api/sessions/start`, { name: this.sessionName });
      await this.ensureAuthenticated();
      
      logger.info('WAHA session is ready');
    } catch (error) {
      logger.error('Failed to start or verify WAHA session:', error);
      throw error;
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      await this.ensureAuthenticated();
      await axios.post(`${this.apiUrl}/api/sendText`, {
        chatId,
        text,
        session: this.sessionName
      });
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }

  async broadcastNotice(notice: Notice) {

    const formattedUrl = notice.url.replace('http://www.', '');

    const message = `
  📢 *New Notice* 📢
  
  📝 *Title:* ${notice.title}

  📅 *Date:* ${notice.date}

  📄 *Download Link:* ${formattedUrl}
  
  Please download the PDF for more details.
    `.trim();
  
    for (const groupId of config.whatsappGroupIds) {
      try {
        await this.sendMessage(groupId, message);
        logger.info(`Notice sent to group: ${groupId}`);
      } catch (error) {
        logger.error(`Error sending message to group ${groupId}:`, error);
      }
    }
  }
  
}

export const wahaService = new WAHAService();

// // Example usage
// async function main() {
//   try {
//     await wahaService.startSession();
    
//     const notice: Notice = {
//       id: 1,
//       title: "Important Announcement",
//       date: "2024-07-25",
//       url: "http://example.com/notice.pdf"
//     };

//     await wahaService.broadcastNotice(notice);
//   } catch (error) {
//     logger.error('Error in main function:', error);
//   }
// }

// main();