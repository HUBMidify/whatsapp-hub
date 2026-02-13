import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState as multiFileAuthState,
  WASocket,
  ConnectionState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import { Prisma } from "@prisma/client"
import pino from 'pino';
import fs from 'fs/promises';
import { handleIncomingMessage } from './messageHandler';

const prisma = new PrismaClient();

const activeConnections = new Map<string, WASocket>();
const pendingConnections = new Set<string>();

export function getWhatsAppConnectionStatus(userId: string): {
  status: "connected" | "pending" | "disconnected";
  connected: boolean;
} {
  if (activeConnections.has(userId)) {
    return { status: "connected", connected: true };
  }

  if (pendingConnections.has(userId)) {
    return { status: "pending", connected: false };
  }

  return { status: "disconnected", connected: false };
}

export async function disconnectWhatsApp(userId: string): Promise<{
  success: boolean;
  status: "disconnected";
}> {
  // Remove from pending (if any)
  pendingConnections.delete(userId);

  const sock = activeConnections.get(userId);

  if (sock) {
    try {
      // Best-effort logout. Baileys typings vary by version.
      type SocketWithOptionalLogout = WASocket & { logout?: () => Promise<void> };
      const maybeLogoutSock = sock as SocketWithOptionalLogout;

      if (typeof maybeLogoutSock.logout === "function") {
        await maybeLogoutSock.logout();
      }
    } catch (e) {
      console.warn(`⚠️  Falha ao fazer logout do WhatsApp (${userId}):`, e);
    }

    try {
      // Baileys `end` expects an optional Error argument in some versions.
      sock.end(undefined);
    } catch (e) {
      console.warn(`⚠️  Falha ao encerrar socket (${userId}):`, e);
    }

    try {
      // `ws` is not always exposed in typings.
      const sockWithWs = sock as WASocket & { ws?: { close?: () => void } };
      if (typeof sockWithWs.ws?.close === "function") sockWithWs.ws.close();
    } catch (e) {
      console.warn(`⚠️  Falha ao fechar WS (${userId}):`, e);
    }

    activeConnections.delete(userId);
  }

  // Apaga credenciais para forçar novo QR no próximo connect
  const authFolder = `./auth_sessions/${userId}`;
  try {
    await fs.rm(authFolder, { recursive: true, force: true });
    console.log(`🧹 Credenciais removidas: ${authFolder}`);
  } catch (e) {
    console.warn(`⚠️  Falha ao remover credenciais (${authFolder}):`, e);
  }

  // Best-effort: marca sessão no banco como DISCONNECTED e limpa credenciais salvas
  try {
    await prisma.whatsAppSession.updateMany({
      where: { userId },
      data: { status: 'DISCONNECTED', credentials: Prisma.JsonNull }
    });
  } catch (e) {
    console.warn('⚠️  Falha ao atualizar sessão no banco:', e);
  }

  return { success: true, status: "disconnected" };
}

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
    const { state, saveCreds } = await multiFileAuthState(authFolder);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
    });

    let qrCodeData: string | null = null;

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        await handleIncomingMessage(message, sock);
      }
    });

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      console.log('🔄 Connection update:', {
        connection,
        hasDisconnect: !!lastDisconnect,
        disconnectReason: (lastDisconnect?.error as Boom)?.output?.statusCode,
        disconnectMessage: lastDisconnect?.error?.message
      });

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
        
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log('❌ Conexão fechada:', {
          statusCode,
          shouldReconnect,
          errorMessage: lastDisconnect?.error?.message
        });

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