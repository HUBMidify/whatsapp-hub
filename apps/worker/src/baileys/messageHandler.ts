import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { PrismaClient, Prisma, OriginLabel, OriginReason } from '@prisma/client';

const prisma = new PrismaClient();

// Zero-width encoding helpers (used to hide the ClickLog.shortId inside the prefilled WhatsApp message)
const ZW0 = "\u200B"; // Zero Width Space -> bit 0
const ZW1 = "\u200C"; // Zero Width Non-Joiner -> bit 1
const ENVELOPE_START = `${ZW0}${ZW1}`;
const ENVELOPE_END = `${ZW1}${ZW0}`;

// NanoID default alphabet (URL-friendly, 64 chars)
const NANOID_ALPHABET = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function decodeZeroWidthToShortId(text: string): string | null {
  // Find our envelope anywhere in the string (not only at the end)
  const re = new RegExp(`${ENVELOPE_START}([${ZW0}${ZW1}]+)${ENVELOPE_END}`);
  const m = text.match(re);
  if (!m) return null;

  const payload = m[1];
  if (!payload) return null;

  // Convert ZW chars -> bitstring
  let bits = "";
  for (const ch of payload) {
    if (ch === ZW0) bits += "0";
    else if (ch === ZW1) bits += "1";
  }

  // Must be a multiple of 6 bits for our base64-like alphabet
  if (bits.length < 6 || bits.length % 6 !== 0) return null;

  let out = "";
  for (let i = 0; i < bits.length; i += 6) {
    const chunk = bits.slice(i, i + 6);
    const idx = parseInt(chunk, 2);
    if (Number.isNaN(idx) || idx < 0 || idx >= NANOID_ALPHABET.length) return null;
    out += NANOID_ALPHABET[idx];
  }

  // Basic sanity check (expected 6-8 chars, but allow a wider range)
  if (out.length < 4 || out.length > 16) return null;
  return out;
}

function stripZeroWidthEnvelope(text: string): string {
  const re = new RegExp(`${ENVELOPE_START}[${ZW0}${ZW1}]+${ENVELOPE_END}`, "g");
  return text.replace(re, "");
}

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

function normalizeUtm(s?: string | null): string {
  return (s || "").toLowerCase().trim();
}

function classifyOriginFromClick(click: {
  gclid?: string | null;
  fbclid?: string | null;
  fbc?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  trackingLink?: { platform?: string | null } | null;
}): { originLabel: OriginLabel; originReason: OriginReason } {
  // Regra 1: Prova incontestável (Click IDs)
  if (click.gclid) return { originLabel: OriginLabel.GOOGLE_ADS, originReason: OriginReason.GCLID };
  if (click.fbclid) return { originLabel: OriginLabel.META_ADS, originReason: OriginReason.FBCLID };
  if (click.fbc) return { originLabel: OriginLabel.META_ADS, originReason: OriginReason.FBC };

  // Regra 2: Plataforma declarada no TrackingLink
  const platform = (click.trackingLink?.platform || "").toLowerCase().trim();
  if (platform === "meta") return { originLabel: OriginLabel.META_ADS, originReason: OriginReason.PLATFORM };
  if (platform === "google") return { originLabel: OriginLabel.GOOGLE_ADS, originReason: OriginReason.PLATFORM };
  if (platform === "social") return { originLabel: OriginLabel.SOCIAL, originReason: OriginReason.PLATFORM };

  // Regra 3: Leitura de UTMs (normalização via regex)
  const src = normalizeUtm(click.utmSource);
  const med = normalizeUtm(click.utmMedium);

  const isPaid = /(cpc|ads|pago|paid)/.test(med);

  if (isPaid && /(face|fb|insta|instagram|meta)/.test(src)) {
    return { originLabel: OriginLabel.META_ADS, originReason: OriginReason.UTM_REGEX };
  }
  if (isPaid && /(google|youtube)/.test(src)) {
    return { originLabel: OriginLabel.GOOGLE_ADS, originReason: OriginReason.UTM_REGEX };
  }

  const looksSocial = /(social|bio|story|stories)/.test(med) || /(tiktok|linkedin|instagram|ig)/.test(src);
  if (looksSocial && !isPaid) {
    return { originLabel: OriginLabel.SOCIAL, originReason: OriginReason.UTM_REGEX };
  }

  // Regra 4: Fallback rastreado (tem UTM mas não é Meta/Google/Social)
  const hasAnyUtm = Boolean(click.utmSource || click.utmMedium || click.utmCampaign || click.utmTerm || click.utmContent);
  if (hasAnyUtm) {
    return { originLabel: OriginLabel.OTHER, originReason: OriginReason.FALLBACK_MATCHED };
  }

  // Regra 5: Fallback final
  return { originLabel: OriginLabel.UNTRACKED, originReason: OriginReason.UNTRACKED };
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
    // Attribution (Waterfall - currently implements Level 0 only)
    // =====================================================
    const now = messageDate;
    const shortId = decodeZeroWidthToShortId(messageText);
    const cleanedMessageText = stripZeroWidthEnvelope(messageText).trim();

    let clickLogId: string | null = null;
    let matchMethod: string | null = 'ORGANIC';
    let matchConfidence: number | null = 0;

    let originLabel: OriginLabel = OriginLabel.UNTRACKED;
    let originReason: OriginReason = OriginReason.UNTRACKED;
    let clickToMessageLatencySeconds: number | null = null;

    if (shortId) {
      const click = await prisma.clickLog.findUnique({
        where: { shortId },
        include: { trackingLink: true, conversations: { select: { id: true } } }
      });

      // Match only if the click exists and isn't already linked to a conversation
      if (click && click.conversations.length === 0) {
        clickLogId = click.id;
        matchMethod = 'ZERO_WIDTH_EXACT';
        matchConfidence = 1;

        const classified = classifyOriginFromClick(click);
        originLabel = classified.originLabel;
        originReason = classified.originReason;

        // Latency (seconds) = message time - click time
        const diffMs = now.getTime() - new Date(click.createdAt).getTime();
        clickToMessageLatencySeconds = diffMs >= 0 ? Math.floor(diffMs / 1000) : null;
      }
    }

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
