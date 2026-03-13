import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState as multiFileAuthState,
  WASocket,
  ConnectionState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import qrcode from "qrcode"
import { PrismaClient, Prisma } from "@prisma/client"
import pino from "pino"
import fs from "fs/promises"
import { handleIncomingMessage } from "./messageHandler"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

const activeConnections = new Map<string, WASocket>()

// Evita múltiplos timers de reconexão concorrentes por userId
const reconnectTimers = new Map<string, NodeJS.Timeout>()

function clearReconnectTimer(userId: string) {
  const t = reconnectTimers.get(userId)
  if (t) clearTimeout(t)
  reconnectTimers.delete(userId)
}

// Evita ficar preso em `pending` para sempre: cada pendência expira automaticamente.
const pendingConnections = new Map<string, NodeJS.Timeout>()

function setPending(userId: string, ttlMs = 45_000) {
  const prev = pendingConnections.get(userId)
  if (prev) clearTimeout(prev)

  const t = setTimeout(() => {
    console.warn(`⏱️ Pending expirou para ${userId}. Limpando estado.`)
    pendingConnections.delete(userId)
    // se existia um socket meia-boca, garantimos limpeza
    activeConnections.delete(userId)
  }, ttlMs)

  pendingConnections.set(userId, t)
}

function clearPending(userId: string) {
  const t = pendingConnections.get(userId)
  if (t) clearTimeout(t)
  pendingConnections.delete(userId)
}

export function getWhatsAppConnectionStatus(userId: string): {
  status: "connected" | "pending" | "disconnected"
  connected: boolean
  whatsappNumber?: string | null
  whatsappJid?: string | null
} {
  const sock = activeConnections.get(userId)
  if (sock?.user?.id) {
    const jid = sock.user.id
    const number = jid.split(":")[0] || null
    return { status: "connected", connected: true, whatsappNumber: number, whatsappJid: jid }
  }

  if (activeConnections.has(userId)) {
    return { status: "connected", connected: true }
  }

  if (pendingConnections.has(userId)) {
    return { status: "pending", connected: false }
  }

  return { status: "disconnected", connected: false }
}

export async function disconnectWhatsApp(userId: string): Promise<{
  success: boolean
  status: "disconnected"
}> {
  // Remove from pending (if any)
  clearPending(userId)
  clearReconnectTimer(userId)

  const sock = activeConnections.get(userId)

  if (sock) {
    try {
      // Best-effort logout. Baileys typings vary by version.
      type SocketWithOptionalLogout = WASocket & { logout?: () => Promise<void> }
      const maybeLogoutSock = sock as SocketWithOptionalLogout

      if (typeof maybeLogoutSock.logout === "function") {
        await maybeLogoutSock.logout()
      }
    } catch (e) {
      console.warn(`⚠️  Falha ao fazer logout do WhatsApp (${userId}):`, e)
    }

    try {
      // Baileys `end` expects an optional Error argument in some versions.
      sock.end(undefined)
    } catch (e) {
      console.warn(`⚠️  Falha ao encerrar socket (${userId}):`, e)
    }

    try {
      // `ws` is not always exposed in typings.
      const sockWithWs = sock as WASocket & { ws?: { close?: () => void } }
      if (typeof sockWithWs.ws?.close === "function") sockWithWs.ws.close()
    } catch (e) {
      console.warn(`⚠️  Falha ao fechar WS (${userId}):`, e)
    }

    activeConnections.delete(userId)
  }

  // Apaga credenciais para forçar novo QR no próximo connect
  const authFolder = `./auth_sessions/${userId}`
  try {
    await fs.rm(authFolder, { recursive: true, force: true })
    console.log(`🧹 Credenciais removidas: ${authFolder}`)
  } catch (e) {
    console.warn(`⚠️  Falha ao remover credenciais (${authFolder}):`, e)
  }

  // Best-effort: marca sessão no banco como DISCONNECTED e limpa credenciais salvas
  try {
    await prisma.whatsAppSession.updateMany({
      where: { userId },
      data: { status: "DISCONNECTED", credentials: Prisma.JsonNull },
    })
  } catch (e) {
    console.warn("⚠️  Falha ao atualizar sessão no banco:", e)
  }

  return { success: true, status: "disconnected" }
}

interface QRResponse {
  qrCode: string
  status: "pending" | "connected" | "error"
  message?: string
}

export async function connectWhatsApp(userId: string): Promise<QRResponse> {
  try {
    if (activeConnections.has(userId)) {
      const sock = activeConnections.get(userId)
      const jid = sock?.user?.id ?? null
      const number = jid ? jid.split(":")[0] : null

      // Mantém o banco consistente com o estado em memória
      try {
        const existing = await prisma.whatsAppSession.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })

        if (existing) {
          await prisma.whatsAppSession.update({
            where: { id: existing.id },
            data: {
              status: "CONNECTED",
              lastPingAt: new Date(),
              whatsappJid: jid,
              whatsappNumber: number,
            },
          })
        }
      } catch (e) {
        console.warn("⚠️  Falha ao sincronizar status CONNECTED no banco:", e)
      }

      return {
        qrCode: "",
        status: "connected",
        message: "WhatsApp já conectado",
      }
    }

    if (pendingConnections.has(userId)) {
      return {
        qrCode: "",
        status: "pending",
        message: "Conexão em andamento, aguarde...",
      }
    }

    setPending(userId)
    console.log(`📱 Iniciando conexão WhatsApp para usuário: ${userId}`)

    const authFolder = `./auth_sessions/${userId}`
    const { state, saveCreds } = await multiFileAuthState(authFolder)

    // ❗ NÃO hardcode `version`.
    // Hardcodes de WA Web version têm causado 405 ("Connection Failure").
    // Melhor tentar buscar a versão mais recente; se falhar, seguimos sem setar version.
    let latestVersion: [number, number, number] | undefined
    try {
      const { version } = await fetchLatestBaileysVersion({
        // evita travar caso a request demore
        signal: AbortSignal.timeout(5_000),
      } as any)
      latestVersion = version as [number, number, number]
    } catch (e) {
      console.warn("⚠️  Não foi possível buscar versão mais recente do WhatsApp Web. Continuando sem version.")
    }

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      ...(latestVersion ? { version: latestVersion } : {}),
    })

    let qrCodeData: string | null = null

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const message of messages) {
        await handleIncomingMessage(message, sock)
      }
    })

    sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const errorMessage = lastDisconnect?.error?.message

      console.log("🔄 Connection update:", {
        connection,
        hasDisconnect: !!lastDisconnect,
        disconnectReason: statusCode,
        disconnectMessage: errorMessage,
      })

      if (qr) {
        console.log("🔲 QR Code gerado")
        qrCodeData = await qrcode.toDataURL(qr)
      }

      if (connection === "open") {
        console.log("✅ WhatsApp conectado!")
        clearPending(userId)
        clearReconnectTimer(userId)

        const jid = sock.user?.id ?? null
        const number = jid ? jid.split(":")[0] : null

        try {
          const existing = await prisma.whatsAppSession.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })

          if (existing) {
            await prisma.whatsAppSession.update({
              where: { id: existing.id },
              data: {
                status: "CONNECTED",
                lastPingAt: new Date(),
                whatsappJid: jid,
                whatsappNumber: number,
              },
            })
          } else {
            await prisma.whatsAppSession.create({
              data: {
                userId,
                credentials: JSON.stringify(state.creds),
                status: "CONNECTED",
                lastPingAt: new Date(),
                whatsappJid: jid,
                whatsappNumber: number,
              },
            })
          }
        } catch (e) {
          console.warn("⚠️  Falha ao persistir status CONNECTED no banco:", e)
        }

        activeConnections.set(userId, sock)
        return
      }

      if (connection === "close") {
        clearPending(userId)
        activeConnections.delete(userId)

        // Mantém o banco consistente quando a conexão cai
        try {
          await prisma.whatsAppSession.updateMany({
            where: { userId },
            data: { status: "DISCONNECTED", lastPingAt: new Date() },
          })
        } catch (e) {
          console.warn("⚠️  Falha ao marcar DISCONNECTED no banco:", e)
        }

        // ✅ STOP LOOP: não reconecta em 405 (Connection Failure)
        if (statusCode === 405) {
          console.error("⛔  405 Connection Failure. Não vou reconectar em loop.", {
            statusCode,
            errorMessage,
          })
          return
        }

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        console.log("❌ Conexão fechada:", {
          statusCode,
          shouldReconnect,
          errorMessage,
        })

        if (shouldReconnect) {
          // Não criar múltiplas reconexões paralelas
          if (reconnectTimers.has(userId)) {
            console.log("⏳ Reconexão já agendada. Ignorando novo agendamento.")
            return
          }

          const t = setTimeout(() => {
            reconnectTimers.delete(userId)
            connectWhatsApp(userId).catch((e) => {
              console.warn("⚠️  Falha na tentativa de reconexão:", e)
            })
          }, 5000)

          reconnectTimers.set(userId, t)
        }
      }
    })

    sock.ev.on("creds.update", saveCreds)

    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (qrCodeData || sock.user) {
          clearInterval(interval)
          resolve(true)
        }
      }, 500)

      setTimeout(() => {
        clearInterval(interval)
        resolve(false)
      }, 30000)
    })

    if (qrCodeData) {
      return {
        qrCode: qrCodeData,
        status: "pending",
        message: "Escaneie o QR Code com WhatsApp",
      }
    }

    if (sock.user) {
      clearPending(userId)
      return {
        qrCode: "",
        status: "connected",
        message: "WhatsApp já conectado",
      }
    }

    clearPending(userId)
    return {
      qrCode: "",
      status: "error",
      message: "Timeout ao gerar QR Code",
    }
  } catch (error) {
    clearPending(userId)
    console.error("❌ Erro ao conectar WhatsApp:", error)
    return {
      qrCode: "",
      status: "error",
      message: error instanceof Error ? error.message : "Erro desconhecido",
    }
  }
}

export function getActiveConnection(userId: string): WASocket | undefined {
  return activeConnections.get(userId)
}