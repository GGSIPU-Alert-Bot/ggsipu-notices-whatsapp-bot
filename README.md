# GGSIPU Notices WhatsApp Bot

This WhatsApp bot server is designed to receive notice updates from a Telegram bot via webhook and broadcast them to specified WhatsApp groups using the WAHA (WhatsApp HTTP API) service.

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Usage](#usage)
6. [Webhook Integration](#webhook-integration)
7. [WAHA Setup](#waha-setup)
8. [Deployment](#deployment)
9. [Contributing](#contributing)
10. [License](#license)

## Features

- Receives notice updates via webhook from Telegram bot
- Broadcasts notices to specified WhatsApp groups
- Uses WAHA for WhatsApp integration
- Implements security measures for webhook communication

## Prerequisites

- Node.js (v14 or later)
- npm (Node Package Manager)
- Docker (for running WAHA)
- Azure account (for deployment)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/shubhsardana29/ggsipu-notices-whatsapp-bot.git
   cd ggsipu-notices-whatsapp-bot
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Build the project:
   ```
   npm run build
   ```

## Configuration

1. Create a `.env` file in the root directory with the following contents:
   ```
   WAHA_API_URL=http://waha-instance-url:3000
   WEBHOOK_SECRET=your_secret_key
   WHATSAPP_GROUP_IDS=group1id@g.us,group2id@g.us
   ```
2. Adjust the `config.ts` file if needed to customize any additional settings.

## Usage

To start the bot in development mode:
```
npm run dev
```
To start the bot in production mode:
```
npm start
```
## Webhook Integration

This bot receives updates from a Telegram bot via webhook. When a new notice is detected by the Telegram bot, it sends a webhook event to this WhatsApp bot, which then broadcasts the notice to specified WhatsApp groups.

### Security Measures

1. The webhook URL is defined using environment variables to prevent hardcoding.
2. SHA256 encrypted signatures are used to verify the authenticity of incoming webhook calls.
3. The secret key for SHA256 encryption is defined in environment variables on both the Telegram and WhatsApp bot servers.

## WAHA Setup

This bot uses WAHA (WhatsApp HTTP API) for WhatsApp integration. To set up WAHA:

1. Pull the WAHA Docker image:
   ```
   docker pull devlikeapro/waha
   ```
2. Run WAHA in a Docker container:
   ```
   docker run -it --rm -p 3000:3000/tcp --name waha devlikeapro/waha
   ```
For more detailed instructions on setting up and using WAHA, refer to the [official WAHA documentation](https://github.com/devlikeapro/whatsapp-http-api).

## Deployment

This bot is deployed on Azure Container Instances. Here's how to deploy it:

1. Build the Docker image:
   ```
   docker buildx build --platform linux/amd64,linux/arm64 -t yourregistry.azurecr.io/whatsapp-bot-image:v1 --push .
   ```
2. Deploy to Azure Container Instances:
   ```
   az container create 
    --resource-group your-resource-group 
    --name whatsapp-bot-container 
    --image yourregistry.azurecr.io/whatsapp-bot-image:v1 
    --dns-name-label whatsapp-bot-dns-label 
    --ports 80 3000    
    --environment-variables 
    WAHA_API_URL=http://waha-instance-url:3000 
    WEBHOOK_SECRET=your_secret_key 
    WHATSAPP_GROUP_IDS=group1id@g.us,group2id@g.us

For more detailed instructions on deploying to Azure Container Instances, refer to the [Azure Container Instances documentation](https://docs.microsoft.com/en-us/azure/container-instances/).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.





