import { PrismaClient, OriginLabel, OriginReason } from "@prisma/client";

// -------------------------------
// Types
// -------------------------------
export type MatchResult = {
  clickLogId: string | null;
  matchMethod: string;
  matchConfidence: number; // 0..1
  originLabel: OriginLabel;
  originReason: OriginReason;
  clickToMessageLatencySeconds: number | null;
  cleanedMessageText: string;
};

// -------------------------------
// Zero-width encoding helpers
// -------------------------------
const ZW0 = "\u200B"; // bit 0
const ZW1 = "\u200C"; // bit 1
const ENVELOPE_START = `${ZW0}${ZW1}`;
const ENVELOPE_END = `${ZW1}${ZW0}`;

// NanoID default alphabet (URL-friendly, 64 chars)
const NANOID_ALPHABET = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function decodeZeroWidthToShortId(text: string): string | null {
  // Find our envelope anywhere in the string (unicode-safe)
  const re = new RegExp(`${ENVELOPE_START}([${ZW0}${ZW1}]+)${ENVELOPE_END}`, "u");
  const m = re.exec(text);
  if (!m) return null;

  const payload = m[1];
  if (!payload) return null;

  // Convert ZW chars -> bitstring
  let bits = "";
  for (const ch of payload) {
    if (ch === ZW0) bits += "0";
    else if (ch === ZW1) bits += "1";
  }

  // Must be multiple of 6 bits
  if (bits.length < 6 || bits.length % 6 !== 0) return null;

  let out = "";
  for (let i = 0; i < bits.length; i += 6) {
    const chunk = bits.slice(i, i + 6);
    const idx = parseInt(chunk, 2);
    if (Number.isNaN(idx) || idx < 0 || idx >= NANOID_ALPHABET.length) return null;
    out += NANOID_ALPHABET[idx];
  }

  // sanity
  if (out.length < 4 || out.length > 16) return null;
  return out;
}

export function stripZeroWidthEnvelope(text: string): string {
  const re = new RegExp(`${ENVELOPE_START}([${ZW0}${ZW1}]+)${ENVELOPE_END}`, "gu");
  return text.replace(re, "");
}

// -------------------------------
// Origin classification
// -------------------------------
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
  // Regra 1: Prova incontestável
  if (click.gclid) return { originLabel: OriginLabel.GOOGLE_ADS, originReason: OriginReason.GCLID };
  if (click.fbclid) return { originLabel: OriginLabel.META_ADS, originReason: OriginReason.FBCLID };
  if (click.fbc) return { originLabel: OriginLabel.META_ADS, originReason: OriginReason.FBC };

  // Regra 2: Plataforma declarada
  const platform = (click.trackingLink?.platform || "").toLowerCase().trim();
  if (platform === "meta") return { originLabel: OriginLabel.META_ADS, originReason: OriginReason.PLATFORM };
  if (platform === "google") return { originLabel: OriginLabel.GOOGLE_ADS, originReason: OriginReason.PLATFORM };
  if (platform === "social") return { originLabel: OriginLabel.SOCIAL, originReason: OriginReason.PLATFORM };

  // Regra 3: UTMs (regex)
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

  // Regra 4: fallback rastreado
  const hasAnyUtm = Boolean(click.utmSource || click.utmMedium || click.utmCampaign || click.utmTerm || click.utmContent);
  if (hasAnyUtm) {
    return { originLabel: OriginLabel.OTHER, originReason: OriginReason.FALLBACK_MATCHED };
  }

  // Regra 5: não rastreado
  return { originLabel: OriginLabel.UNTRACKED, originReason: OriginReason.UNTRACKED };
}

function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scorePrefixMatch(message: string, prefilled: string | null | undefined): number {
  if (!prefilled) return 0;

  const m = normText(message);
  const p = normText(prefilled);
  if (!p) return 0;

  if (m.startsWith(p)) return 100;

  const p10 = p.slice(0, 10);
  if (p10.length >= 4 && m.startsWith(p10)) return 60;

  const p6 = p.slice(0, 6);
  if (p6.length >= 3 && m.startsWith(p6)) return 35;

  return 0;
}

// -------------------------------
// Engine (Level 0 + Level 1)
// -------------------------------
function getTemporalWindowMs(): number {
  const raw = process.env.ATTR_MATCH_WINDOW_HOURS ?? "24";
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) return 24 * 60 * 60 * 1000;
  return Math.floor(hours * 60 * 60 * 1000);
}

/**
 * Waterfall v1:
 * - Level 0: ZERO_WIDTH_EXACT (1.0)
 * - Level 1: TEMPORAL_WINDOW (0.7) - last click for that WhatsApp destination within window hours
 * - fallback: ORGANIC/UNTRACKED
 */
export async function runAttributionMatch(args: {
  prisma: PrismaClient;
  whatsappNumber: string | null;
  messageText: string;
  messageDate: Date;
}): Promise<MatchResult> {
  const { prisma, whatsappNumber, messageText, messageDate } = args;

  const cleanedMessageText = stripZeroWidthEnvelope(messageText).trim();
  const now = messageDate;

  // defaults
  let clickLogId: string | null = null;
  let matchMethod = "ORGANIC";
  let matchConfidence = 0;

  let originLabel: OriginLabel = OriginLabel.UNTRACKED;
  let originReason: OriginReason = OriginReason.UNTRACKED;
  let clickToMessageLatencySeconds: number | null = null;

  // ----------------------------
  // Level 0: hidden shortId
  // ----------------------------
  const shortId = decodeZeroWidthToShortId(messageText);
  if (shortId) {
    const click = await prisma.clickLog.findUnique({
      where: { shortId },
      include: { trackingLink: true, conversations: { select: { id: true } } },
    });

    if (click && click.conversations.length === 0) {
      clickLogId = click.id;
      matchMethod = "ZERO_WIDTH_EXACT";
      matchConfidence = 1;

      const classified = classifyOriginFromClick(click);
      originLabel = classified.originLabel;
      originReason = classified.originReason;

      const diffMs = now.getTime() - new Date(click.createdAt).getTime();
      clickToMessageLatencySeconds = diffMs >= 0 ? Math.floor(diffMs / 1000) : null;

      return {
        clickLogId,
        matchMethod,
        matchConfidence,
        originLabel,
        originReason,
        clickToMessageLatencySeconds,
        cleanedMessageText,
      };
    }
  }

  // ----------------------------
  // Level 1: temporal window (configurable)
  // ----------------------------
  // Se não sabemos qual WhatsApp está conectado (sessão), não fazemos match temporal
  // para evitar atribuição cruzada entre contas.
  if (whatsappNumber) {
    const windowMs = getTemporalWindowMs();
    const windowStart = new Date(now.getTime() - windowMs);

    const candidates = await prisma.clickLog.findMany({
      where: {
        // Isolamos por número/instância via relação TrackingLink
        trackingLink: {
          is: {
            whatsappNumber,
          },
        },
        createdAt: { gte: windowStart, lte: now },
        conversations: { none: {} },
      },
      orderBy: { createdAt: "desc" },
      include: {
        trackingLink: {
          select: {
            platform: true,
            preFilledMessage: true,
          },
        },
      },
      take: 25,
    });

    if (candidates.length > 0) {
      const msgClean = normText(cleanedMessageText);

      // 1) Desempate por prefixo (preFilledMessage)
      let bestScore = -1;
      for (const c of candidates) {
        const s = scorePrefixMatch(msgClean, c.trackingLink?.preFilledMessage);
        if (s > bestScore) bestScore = s;
      }

      let finalists = candidates;
      if (bestScore > 0) {
        finalists = candidates.filter(
          (c) => scorePrefixMatch(msgClean, c.trackingLink?.preFilledMessage) === bestScore
        );
      }

      // 2) Proximidade temporal (ms) e fallback determinístico
      if (finalists.length > 1) {
        const target = now.getTime();
        finalists.sort((a, b) => {
          const da = Math.abs(new Date(a.createdAt).getTime() - target);
          const db = Math.abs(new Date(b.createdAt).getTime() - target);
          if (da !== db) return da - db;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      }

      const chosen = finalists[0];

      clickLogId = chosen.id;
      matchMethod = "TEMPORAL_WINDOW";
      // Se houve colisão (mais de 1 candidato), reduzimos confiança
      matchConfidence = candidates.length === 1 ? 0.7 : 0.75;

      const classified = classifyOriginFromClick(chosen);
      originLabel = classified.originLabel;
      originReason = classified.originReason;

      const diffMs = now.getTime() - new Date(chosen.createdAt).getTime();
      clickToMessageLatencySeconds = diffMs >= 0 ? Math.floor(diffMs / 1000) : null;
    }
  }

  return {
    clickLogId,
    matchMethod,
    matchConfidence,
    originLabel,
    originReason,
    clickToMessageLatencySeconds,
    cleanedMessageText,
  };
}