import express from 'express';
import webhookRoutes from './routes/webhookRoutes';
import { wahaService } from './services/wahaService';
import { config } from './config/config';

const app = express();

app.use('/webhook', webhookRoutes);

async function startServer() {
  try {
    await wahaService.startSession();
    
    app.listen(config.port, () => {
      console.log(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
