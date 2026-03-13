import express from 'express';
import dotenv from 'dotenv';
import { connectWhatsApp, getWhatsAppConnectionStatus, disconnectWhatsApp } from './baileys/connection';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

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

app.get('/status/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const status = getWhatsAppConnectionStatus(userId);

    return res.json(status);
  } catch (error) {
    console.error('❌ Erro em GET /status/:userId:', error);
    return res.status(500).json({ status: 'error', connected: false });
  }
});

app.post('/disconnect/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    // Derruba a conexão em memória
    await disconnectWhatsApp(userId);

    // Best-effort: atualiza status no banco (se existir registro)
    try {
      await prisma.whatsAppSession.updateMany({
        where: { userId },
        data: { status: 'DISCONNECTED' }
      });
    } catch (dbErr) {
      console.warn('⚠️  Não foi possível atualizar status no banco:', dbErr);
    }

    return res.json({ success: true, status: 'disconnected' });
  } catch (error) {
    console.error('❌ Erro em POST /disconnect/:userId:', error);
    return res.status(500).json({ success: false, error: 'Erro ao desconectar' });
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

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Worker rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📱 QR Code: http://localhost:${PORT}/qrcode/{userId}`);
  
  setTimeout(() => {
    autoConnectWhatsApp();
  }, 3000);
});