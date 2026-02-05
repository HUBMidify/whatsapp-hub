import express from 'express';
import dotenv from 'dotenv';
import { connectWhatsApp } from './baileys/connection';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Gerar QR Code para conectar WhatsApp
app.get('/qrcode/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    console.log(`📱 Solicitação QR Code para userId: ${userId}`);

    const result = await connectWhatsApp(userId);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao gerar QR Code:', error);
    res.status(500).json({
      error: 'Erro ao gerar QR Code',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Worker rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📱 QR Code: http://localhost:${PORT}/qrcode/{userId}`);
});
