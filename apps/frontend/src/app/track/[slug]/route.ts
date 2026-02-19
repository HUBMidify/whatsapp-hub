import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

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
  const utmCampaign = url.searchParams.get("utm_campaign")

  // 4) Extrair headers / metadados
  const userAgent = request.headers.get("user-agent")
  const ipAddress = getClientIp(request)

  // Referer existe, mas seu schema atual não tem campo "referrer"
  const _referrer = request.headers.get("referer") // capturado para futuro upgrade
  void _referrer

  // 5) Calcular fbc (se fbclid existe)
  const fbc = fbclid ? `fb.1.${Date.now()}.${fbclid}` : null

  // 6) Salvar ClickLog no banco (não bloquear o redirect)
  void prisma.clickLog
    .create({
      data: {
        trackingLinkId: trackingLink.id,
        fbclid,
        fbc,
        gclid,
        utmSource,
        utmCampaign,
        ipAddress,
        userAgent,
      },
    })
    .catch((err) => {
      console.error("Falha ao salvar ClickLog:", err)
    })

  // 7) Construir URL WhatsApp com mensagem
  const message = trackingLink.preFilledMessage?.trim() || "Olá!"

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
