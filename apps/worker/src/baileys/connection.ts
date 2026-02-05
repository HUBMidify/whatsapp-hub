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

const prisma = new PrismaClient();

// Armazena conexões ativas por userId
const activeConnections = new Map<string, WASocket>();
const pendingConnections = new Set<string>(); // Previne múltiplas tentativas

interface QRResponse {
  qrCode: string;
  status: 'pending' | 'connected' | 'error';
  message?: string;
}

export async function connectWhatsApp(userId: string): Promise<QRResponse> {
  try {
    // Se já está conectado, retornar status
    if (activeConnections.has(userId)) {
      return {
        qrCode: '',
        status: 'connected',
        message: 'WhatsApp já conectado'
      };
    }

    // Se já está tentando conectar, aguardar
    if (pendingConnections.has(userId)) {
      return {
        qrCode: '',
        status: 'pending',
        message: 'Conexão em andamento, aguarde...'
      };
    }

    pendingConnections.add(userId);
    console.log(`📱 Iniciando conexão WhatsApp para usuário: ${userId}`);

    // Buscar sessão existente no banco
    const existingSession = await prisma.whatsAppSession.findFirst({
      where: { userId }
    });

    // Usar auth state do banco (se existir)
    const authFolder = `./auth_sessions/${userId}`;
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
    });

    let qrCodeData: string | null = null;

    // Listener de conexão
    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      // Gerar QR Code
      if (qr) {
        console.log('🔲 QR Code gerado');
        qrCodeData = await qrcode.toDataURL(qr);
      }

      // Conexão estabelecida
      if (connection === 'open') {
        console.log('✅ WhatsApp conectado!');
        pendingConnections.delete(userId);
        
        // Salvar/atualizar sessão no banco
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

      // Desconexão
      if (connection === 'close') {
        pendingConnections.delete(userId);
        activeConnections.delete(userId);
        
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('❌ Conexão fechada. Reconectar?', shouldReconnect);

        if (shouldReconnect) {
          setTimeout(() => connectWhatsApp(userId), 5000); // Aguardar 5s antes de reconectar
        }
      }
    });

    // Listener de atualização de credenciais
    sock.ev.on('creds.update', saveCreds);

    // Aguardar QR Code ser gerado (timeout 30s)
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
