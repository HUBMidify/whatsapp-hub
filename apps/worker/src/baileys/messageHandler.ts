import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { PrismaClient, Prisma } from '@prisma/client';
import { runAttributionMatch } from "../attribution/attributionEngine";

const prisma = new PrismaClient();

type BaileysMessageTimestamp = number | string | bigint | { toNumber: () => number };

function getBaileysMessageDate(message: WAMessage): Date {
  // Baileys uses seconds-based timestamps (often a Long-like value)
  const raw = (message as unknown as { messageTimestamp?: BaileysMessageTimestamp }).messageTimestamp;
  if (raw === undefined || raw === null) return new Date();

  const n =
    typeof raw === "number" ? raw :
    typeof raw === "bigint" ? Number(raw) :
    typeof raw === "string" ? Number(raw) :
    raw && typeof raw === "object" && "toNumber" in raw ? raw.toNumber() :
    Number(raw as unknown);

  if (!Number.isFinite(n) || n <= 0) return new Date();

  // messageTimestamp is in seconds
  return new Date(n * 1000);
}

export async function handleIncomingMessage(message: WAMessage, sock?: WASocket) {
  try {
    if (message.key.fromMe) {
      return;
    }

    if (message.key.remoteJid?.includes('@g.us')) {
      return;
    }

    const messageDate = getBaileysMessageDate(message);

    const rawJid = message.key.remoteJid || '';
    
    const phone = rawJid
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '');
    
    const messageText = 
      message.message?.conversation || 
      message.message?.extendedTextMessage?.text || 
      '';

    if (!phone || !messageText) {
      console.log('⚠️  Mensagem ignorada (sem telefone ou texto)');
      return;
    }

    console.log(`📩 Mensagem de ${phone}: ${messageText.substring(0, 50)}...`);

    let contactName: string | null = null;
    
    if (sock) {
      try {
        const contactInfo = message.pushName || null;
        contactName = contactInfo;
        console.log(`👤 Nome do contato: ${contactName || 'Não disponível'}`);
      } catch (error) {
        console.log('⚠️  Não foi possível buscar nome do contato');
      }
    }

    let lead = await prisma.lead.findUnique({
      where: { phone }
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          phone,
          name: contactName,
          firstSeenAt: messageDate,
          lastSeenAt: messageDate
        }
      });
      console.log(`✅ Lead criado: ${phone}${contactName ? ` (${contactName})` : ''}`);
    } else {
      const updateData: Prisma.LeadUpdateInput = { lastSeenAt: messageDate };
      if (!lead.name && contactName) {
        updateData.name = contactName;
      }
      
      await prisma.lead.update({
        where: { id: lead.id },
        data: updateData
      });
    }

    // =====================================================
    // Attribution (Waterfall)
    // =====================================================
    // whatsappNumber = the business number that received this inbound message (from the active Baileys session)
    const jid = sock?.user?.id ?? null; // ex: 5521999391590:10@s.whatsapp.net
    const whatsappNumber = jid ? jid.split(":")[0] : null;

    const attribution = await runAttributionMatch({
      prisma,
      messageText,
      messageDate,
      whatsappNumber,
    });

    const {
      cleanedMessageText,
      clickLogId,
      matchMethod,
      matchConfidence,
      originLabel,
      originReason,
      clickToMessageLatencySeconds,
    } = attribution;

    const conversation = await prisma.conversation.create({
      data: {
        leadId: lead.id,
        messageText: cleanedMessageText,
        clickLogId,
        matchMethod,
        matchConfidence,
        originLabel,
        originReason,
        clickToMessageLatencySeconds,
        createdAt: messageDate,
      }
    });

    console.log(`✅ Conversa salva: ID ${conversation.id}`);

  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
  }
}
