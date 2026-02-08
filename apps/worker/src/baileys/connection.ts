import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  WASocket,
  ConnectionState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { handleIncomingMessage } from './messageHandler';

const prisma = new PrismaClient();

const activeConnections = new Map<string, WASocket>();
const pendingConnections = new Set<string>();

interface QRResponse {
  qrCode: string;
  status: 'pending' | 'connected' | 'error';
  message?: string;
}

export async function connectWhatsApp(userId: string): Promise<QRResponse> {
  try {
    if (activeConnections.has(userId)) {
      return {
        qrCode: '',
        status: 'connected',
        message: 'WhatsApp já conectado'
      };
    }

    if (pendingConnections.has(userId)) {
      return {
        qrCode: '',
        status: 'pending',
        message: 'Conexão em andamento, aguarde...'
      };
    }

    pendingConnections.add(userId);
    console.log(`📱 Iniciando conexão WhatsApp para usuário: ${userId}`);

    const existingSession = await prisma.whatsAppSession.findFirst({
      where: { userId }
    });

    const authFolder = `./auth_sessions/${userId}`;
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
    });

    let qrCodeData: string | null = null;

    // Listener de mensagens (passando sock para buscar nome)
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        await handleIncomingMessage(message, sock);
      }
    });

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('🔲 QR Code gerado');
        qrCodeData = await qrcode.toDataURL(qr);
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp conectado!');
        pendingConnections.delete(userId);
        
        await prisma.whatsAppSession.upsert({
          where: { id: existingSession?.id || 'new' },
          create: {
            userId,
            credentials: JSON.stringify(state.creds),
            status: 'CONNECTED',
            lastPingAt: new Date()
          },
          update: {
            status: 'CONNECTED',
            lastPingAt: new Date()
          }
        });

        activeConnections.set(userId, sock);
      }

      if (connection === 'close') {
        pendingConnections.delete(userId);
        activeConnections.delete(userId);
        
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('❌ Conexão fechada. Reconectar?', shouldReconnect);

        if (shouldReconnect) {
          setTimeout(() => connectWhatsApp(userId), 5000);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (qrCodeData || sock.user) {
          clearInterval(interval);
          resolve(true);
        }
      }, 500);

      setTimeout(() => {
        clearInterval(interval);
        resolve(false);
      }, 30000);
    });

    if (qrCodeData) {
      return {
        qrCode: qrCodeData,
        status: 'pending',
        message: 'Escaneie o QR Code com WhatsApp'
      };
    }

    if (sock.user) {
      pendingConnections.delete(userId);
      return {
        qrCode: '',
        status: 'connected',
        message: 'WhatsApp já conectado'
      };
    }

    pendingConnections.delete(userId);
    return {
      qrCode: '',
      status: 'error',
      message: 'Timeout ao gerar QR Code'
    };

  } catch (error) {
    pendingConnections.delete(userId);
    console.error('❌ Erro ao conectar WhatsApp:', error);
    return {
      qrCode: '',
      status: 'error',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
}

export function getActiveConnection(userId: string): WASocket | undefined {
  return activeConnections.get(userId);
}
