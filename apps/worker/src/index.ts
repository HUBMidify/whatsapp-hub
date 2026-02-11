import express from 'express';
import dotenv from 'dotenv';
import { connectWhatsApp } from './baileys/connection';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

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

async function autoConnectWhatsApp() {
  try {
    console.log('🔄 Buscando sessões ativas...');
    
    const sessions = await prisma.whatsAppSession.findMany({
      where: { status: 'CONNECTED' }
    });

    if (sessions.length === 0) {
      console.log('⚠️  Nenhuma sessão ativa encontrada. Use /qrcode para conectar.');
      return;
    }

    console.log(`✅ ${sessions.length} sessão(ões) encontrada(s). Reconectando...`);

    for (const session of sessions) {
      console.log(`🔌 Reconectando usuário: ${session.userId}`);
      await connectWhatsApp(session.userId);
    }
  } catch (error) {
    console.error('❌ Erro ao auto-conectar:', error);
  }
}

app.listen(PORT, async () => {
  console.log(`🚀 Worker rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📱 QR Code: http://localhost:${PORT}/qrcode/{userId}`);
  
  setTimeout(() => {
    autoConnectWhatsApp();
  }, 3000);
});