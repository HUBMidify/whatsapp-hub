export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function getClientIp(request: Request) {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() || null

  const xRealIp = request.headers.get("x-real-ip")
  if (xRealIp) return xRealIp.trim()

  return null
}

function buildWaMeUrlFromNumber(number: string, message: string) {
  const cleanNumber = number.replace(/\D/g, "")
  const clean = new URL(`https://wa.me/${cleanNumber}`)
  if (message) clean.searchParams.set("text", message)
  return clean.toString()
}

function buildWhatsAppRedirectUrl(baseRedirectUrl: string, message: string) {
  // IMPORTANT: never forward any existing query params (UTMs, fbclid, etc.) to WhatsApp.
  // We keep only the base (origin + pathname) and set `text`.
  const base = new URL(baseRedirectUrl)

  // Rebuild a clean URL without any original query params
  const clean = new URL(`${base.origin}${base.pathname}`)

  // wa.me / api.whatsapp.com use `text`
  if (message) {
    clean.searchParams.set("text", message)
  }

  return clean.toString()
}

// ------------------------------------------------------------
// ShortId + Zero‑Width helpers
// ------------------------------------------------------------
// IMPORTANT: keep this alphabet in sync with the worker decoder.
// 64 chars => each char is encoded in 6 bits.
const SHORT_ID_ALPHABET = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ZW0 = "\u200B"; // Zero‑Width Space
const ZW1 = "\u200C"; // Zero‑Width Non‑Joiner
const ZW_START = ZW0 + ZW1;
const ZW_END = ZW1 + ZW0;

function generateShortId(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SHORT_ID_ALPHABET[bytes[i] % SHORT_ID_ALPHABET.length];
  }
  return out;
}

function encodeShortIdToZeroWidth(shortId: string): string {
  let bits = "";
  for (const ch of shortId) {
    const idx = SHORT_ID_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`shortId contém caractere inválido: ${ch}`);
    bits += idx.toString(2).padStart(6, "0");
  }

  const payload = Array.from(bits)
    .map((b) => (b === "0" ? ZW0 : ZW1))
    .join("");

  // Envelope para evitar falsos positivos (ZWJ/emojis etc.)
  return ZW_START + payload + ZW_END;
}

function injectZeroWidthAfterFirstChar(message: string, shortId: string): string {
  const trimmed = message ?? "";
  if (!trimmed) return trimmed;

  // Use codepoints to behave better with unicode.
  const chars = Array.from(trimmed);
  const first = chars[0] ?? "";
  const rest = chars.slice(1).join("");

  const envelope = encodeShortIdToZeroWidth(shortId);
  return first + envelope + rest;
}

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug

  // 1) Buscar TrackingLink por slug (e opcionalmente ignorar arquivados)
  const trackingLink = await prisma.trackingLink.findFirst({
    where: {
      slug,
      archivedAt: null,
    },
  })

  // 2) Se não encontrado → 404
  if (!trackingLink) {
    return new Response("Tracking link não encontrado", { status: 404 })
  }

  // 3) Extrair query params
  const url = new URL(request.url)
  const fbclid = url.searchParams.get("fbclid")
  const gclid = url.searchParams.get("gclid")
  const utmSource = url.searchParams.get("utm_source")
  const utmMedium = url.searchParams.get("utm_medium")
  const utmCampaign = url.searchParams.get("utm_campaign")
  const utmTerm = url.searchParams.get("utm_term")
  const utmContent = url.searchParams.get("utm_content")

  // 4) Extrair headers / metadados
  const userAgent = request.headers.get("user-agent")
  const ipAddress = getClientIp(request)

  // Referer existe, mas seu schema atual não tem campo "referrer"
  const _referrer = request.headers.get("referer") // capturado para futuro upgrade
  void _referrer

  // 5) Calcular fbc (se fbclid existe)
  const fbc = fbclid ? `fb.1.${Date.now()}.${fbclid}` : null

  // 6) Gerar shortId + salvar ClickLog.
  // Idealmente, criamos o ClickLog antes do redirect para garantir que o ID embutido na mensagem exista no banco.
  // Garantia extra: em caso raro de colisão do shortId (unique), tentamos novamente algumas vezes.

  let shortId = generateShortId(8);
  let clickLogCreated = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.clickLog.create({
        data: {
          shortId,
          trackingLinkId: trackingLink.id,
          fbclid,
          fbc,
          gclid,
          utmSource,
          utmMedium,
          utmCampaign,
          utmTerm,
          utmContent,
          ipAddress,
          userAgent,
        },
      });

      clickLogCreated = true;
      break;
    } catch (err: unknown) {
      const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : undefined;
      const isUniqueViolation = code === "P2002";

      if (isUniqueViolation && attempt < 3) {
        // colisão improvável: gere um novo id e tente de novo
        shortId = generateShortId(8);
        continue;
      }

      // Se falhar, seguimos sem o ID invisível (cai no waterfall probabilístico do worker).
      console.error("Falha ao salvar ClickLog:", err);
      break;
    }
  }

  // 7) Construir URL WhatsApp com mensagem
  const baseMessage = trackingLink.preFilledMessage?.trim() || "Olá!";
  const message = clickLogCreated
    ? injectZeroWidthAfterFirstChar(baseMessage, shortId)
    : baseMessage;

  // 8) Redirecionar (302)
  // Preferência: whatsappNumber. Fallback: destinationUrl (modo compatibilidade).
  let redirectTo: string | null = null

  if (trackingLink.whatsappNumber && trackingLink.whatsappNumber.trim() !== "") {
    redirectTo = buildWaMeUrlFromNumber(trackingLink.whatsappNumber, message)
  } else if (trackingLink.destinationUrl && trackingLink.destinationUrl.trim() !== "") {
    redirectTo = buildWhatsAppRedirectUrl(trackingLink.destinationUrl, message)
  }

  if (!redirectTo) {
    return new Response(
      "Tracking link sem WhatsApp configurado (whatsappNumber/destinationUrl)",
      { status: 400 }
    )
  }

  return Response.redirect(redirectTo, 302)
}
