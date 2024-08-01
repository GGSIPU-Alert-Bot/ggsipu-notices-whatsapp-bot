import axios from 'axios';
import { config } from '../config/config';
import { Notice } from '../models/Notice';
import logger from '../utils/logger';
import { backOff } from "exponential-backoff";

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
  private qrCodeExpirationTime: number = 60000; 
  private maxStartingWaitTime: number = 60000;

  constructor() {
    this.apiUrl = config.wahaApiUrl;
    this.sessionName = config.wahaSessionName;
  }

  async ensureAuthenticated(): Promise<void> {
    const sessionStatus = await this.checkSessionStatus();
    if (sessionStatus.status === 'SCAN_QR_CODE') {
      await this.handleQrCodeScan();
    } else if (sessionStatus.status === 'STARTING') {
      await this.waitForQrCode();
    } else if (sessionStatus.status !== 'WORKING') {
      throw new Error(`Unexpected session status: ${sessionStatus.status}`);
    } else {
      logger.info(`Session authenticated for user: ${sessionStatus.me?.pushName}`);
    }
  }  

  private async checkSessionStatus(): Promise<SessionStatus> {
    try {
      const response = await axios.get<SessionStatus>(`${this.apiUrl}/api/sessions/${this.sessionName}`);
      logger.debug(`Current session status: ${response.data.status}`);
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

  private async waitForQrCode(): Promise<void> {
    logger.info('Waiting for QR code to become available...');
    const startTime = Date.now();
    while (Date.now() - startTime < this.maxStartingWaitTime) {
      const sessionStatus = await this.checkSessionStatus();
      if (sessionStatus.status === 'SCAN_QR_CODE') {
        await this.handleQrCodeScan();
        return;
      } else if (sessionStatus.status === 'WORKING') {
        logger.info('Session is now working.');
        return;
      } else if (sessionStatus.status !== 'STARTING') {
        throw new Error(`Unexpected session status while waiting for QR code: ${sessionStatus.status}`);
      }
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before checking again
    }
    throw new Error('Timed out waiting for QR code to become available');
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

  async downloadPdfWithRetry(url: string): Promise<Buffer> {
    return backOff(async () => {
      logger.info(`Attempting to download PDF from ${url}`);
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded));
          logger.info(`Download progress: ${percentCompleted}%`);
        }
      });
      const pdfBuffer = Buffer.from(response.data, 'binary');
      logger.info(`Downloaded PDF. Size: ${pdfBuffer.length} bytes`);
      if (pdfBuffer.length > 50 * 1024 * 1024) { // If larger than 50MB
        throw new Error('PDF too large to send directly');
      }
      return pdfBuffer;
    }, {
      numOfAttempts: 5,
      startingDelay: 1000,
      timeMultiple: 2,
      maxDelay: 30000,
      jitter: 'full'
    });
  }

  async sendFileMessage(chatId: string, fileBuffer: Buffer, filename: string, caption: string): Promise<void> {
    try {
      await this.ensureAuthenticated();
      
      const response = await backOff(() => axios.post(`${this.apiUrl}/api/sendFile`, {
        chatId,
        file: {
          mimetype: 'application/pdf',
          filename: filename,
          data: fileBuffer.toString('base64')
        },
        caption,
        session: this.sessionName
      }), {
        numOfAttempts: 5,
        startingDelay: 1000,
        timeMultiple: 2,
        maxDelay: 60000,
        jitter: 'full'
      });

      logger.info(`File message sent successfully to ${chatId}. Response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Failed to send file message to ${chatId}. Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
      } else {
        logger.error(`Failed to send file message to ${chatId}. Error: ${error}`);
      }
      throw error;
    }
  }

  async sendLinkPreview(chatId: string, url: string, title: string): Promise<void> {
    try {
      await this.ensureAuthenticated();
      const response = await backOff(() => axios.post(`${this.apiUrl}/api/sendLinkPreview`, {
        chatId,
        url,
        title,
        session: this.sessionName
      }), {
        numOfAttempts: 5,
        startingDelay: 1000,
        timeMultiple: 2,
        maxDelay: 60000,
        jitter: 'full'
      });
      logger.info(`Link preview sent successfully to ${chatId}. Response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Failed to send link preview to ${chatId}. Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
      } else {
        logger.error(`Failed to send link preview to ${chatId}. Error: ${error}`);
      }
      throw error;
    }
  }

  async broadcastNotice(notice: Notice) {
    const caption = this.formatNoticeCaption(notice);
  
    for (const groupId of config.whatsappGroupIds) {
      try {
        logger.info(`Downloading PDF for notice ${notice.id}. URL: ${notice.url}`);
        const pdfBuffer = await this.downloadPdfWithRetry(notice.url);
        logger.info(`Downloaded PDF for notice ${notice.id}. Size: ${pdfBuffer.length} bytes`);

        if (pdfBuffer.length > 50 * 1024 * 1024) {
          await this.splitAndSendLargePdf(notice, pdfBuffer, groupId);
        } else {
          const filename = `Notice_${notice.id}.pdf`;
          await this.sendFileMessage(groupId, pdfBuffer, filename, caption);
        }

        logger.info(`Notice sent to group: ${groupId}`);
      } catch (error) {
        logger.error(`Error sending notice to group ${groupId}:`, error);
        // Fallback to sending as link preview
        try {
          const title = `${caption}\n\nClick to view the notice`;
          await this.sendLinkPreview(groupId, notice.url, title);
          logger.info(`Notice sent as link preview to group: ${groupId}`);
        } catch (fallbackError) {
          logger.error(`Failed to send even as link preview to group ${groupId}:`, fallbackError);
        }
      }
    }
  }

  private formatNoticeCaption(notice: Notice): string {
    return `
📢 *New Notice*

📅 *Date:* ${new Date(notice.date).toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

📄 *Title:* ${notice.title}
    `.trim();
  }

  private async splitAndSendLargePdf(notice: Notice, pdfBuffer: Buffer, chatId: string): Promise<void> {
    const maxSize = 50 * 1024 * 1024; // 50 MB
    const parts = Math.ceil(pdfBuffer.length / maxSize);
    for (let i = 0; i < parts; i++) {
      const start = i * maxSize;
      const end = Math.min((i + 1) * maxSize, pdfBuffer.length);
      const partBuffer = pdfBuffer.slice(start, end);
      const partNotice = {...notice, title: `${notice.title} (Part ${i + 1} of ${parts})`};
      const caption = this.formatNoticeCaption(partNotice);
      const filename = `Notice_${notice.id}_Part_${i + 1}_of_${parts}.pdf`;
      await this.sendFileMessage(chatId, partBuffer, filename, caption);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between parts
    }
  }
}

export const wahaService = new WAHAService();