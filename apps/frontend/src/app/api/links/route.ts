import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const prisma = new PrismaClient()


async function resolveUserId(request: Request): Promise<string | null> {
  // Produção/Preview: sessão do NextAuth
  try {
    const session = await getServerSession(authOptions)
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id
    if (typeof sessionUserId === "string" && sessionUserId) return sessionUserId
  } catch {
    // ignora e tenta fallback
  }

  // Dev/Curl fallback
  const headerUserId = request.headers.get("x-user-id")
  if (headerUserId) return headerUserId

  return null
}

// LISTAR LINKS (somente não arquivados)
export async function GET(request: Request) {
  const userId = await resolveUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const archived = searchParams.get("archived") // "true" | null

  const where =
    archived === "true"
      ? { userId, NOT: { archivedAt: null } }
      : { userId, archivedAt: null } 

  const links = await prisma.trackingLink.findMany({
      where,
      orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ links })
}

// CRIAR LINK
export async function POST(request: Request) {
  const userId = await resolveUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    name,
    slug,
    destinationUrl,
    platform,
    whatsappNumber,
    preFilledMessage,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
  } = body

  const hasDestinationUrl =
    typeof destinationUrl === "string" && destinationUrl.trim() !== ""
  const hasWhatsappNumber =
    typeof whatsappNumber === "string" && whatsappNumber.trim() !== ""

  if (!name || !slug || (!hasDestinationUrl && !hasWhatsappNumber)) {
    return NextResponse.json(
      {
        error:
          "Campos obrigatórios: name, slug e (destinationUrl ou whatsappNumber)",
      },
      { status: 400 }
    )
  }

  const normalizedSlug = String(slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

    const normalizedWhatsappNumber =
      typeof whatsappNumber === "string" && whatsappNumber.trim() !== ""
        ? whatsappNumber.trim()
        : null

   try {
    const link = await prisma.trackingLink.create({
      data: {
        userId,
        name,
        slug: normalizedSlug,
        destinationUrl: hasDestinationUrl ? destinationUrl.trim() : null,
        platform: typeof platform === "string" && platform.trim() !== "" ? platform.trim() : null,
        whatsappNumber: normalizedWhatsappNumber,
        preFilledMessage: preFilledMessage ?? null,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        utmTerm: utmTerm ?? null,
        utmContent: utmContent ?? null,
      },
    })

    return NextResponse.json({ link }, { status: 201 })
  } catch (err: unknown) {
    console.error("[POST /api/links] create error:", err)
    // Prisma unique constraint (ex.: slug já existe)
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Slug já existe" }, { status: 409 })
    }

    // Em desenvolvimento, retornar uma pista mínima do erro ajuda a debugar
const isDev = process.env.NODE_ENV !== "production"
if (isDev) {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error"
  return NextResponse.json(
    { error: "Erro ao criar link", details: message },
    { status: 500 }
  )
}

return NextResponse.json({ error: "Erro ao criar link" }, { status: 500 })
  }
}

// EDITAR LINK (PATCH no mesmo endpoint)
export async function PATCH(request: Request) {
  const userId = await resolveUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    id,
    name,
    slug,
    destinationUrl,
    platform,
    whatsappNumber,
    preFilledMessage,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
  } = body

  if (!id) {
    return NextResponse.json({ error: "Campo obrigatório: id" }, { status: 400 })
  }

  const normalizedSlug =
    typeof slug === "string"
      ? String(slug)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      : undefined

  const data: Record<string, unknown> = {}

  if (typeof name === "string") data.name = name
  if (typeof destinationUrl === "string") data.destinationUrl = destinationUrl
  if (typeof platform !== "undefined") {
    data.platform =
      typeof platform === "string" && platform.trim() !== "" ? platform.trim() : null
  }
  if (typeof preFilledMessage !== "undefined") data.preFilledMessage = preFilledMessage ?? null
  if (typeof whatsappNumber !== "undefined") data.whatsappNumber = whatsappNumber ?? null
  if (typeof utmSource !== "undefined") data.utmSource = utmSource ?? null
  if (typeof utmCampaign !== "undefined") data.utmCampaign = utmCampaign ?? null
  if (typeof utmMedium !== "undefined") data.utmMedium = utmMedium ?? null
  if (typeof utmTerm !== "undefined") data.utmTerm = utmTerm ?? null
  if (typeof utmContent !== "undefined") data.utmContent = utmContent ?? null
  if (typeof normalizedSlug === "string" && normalizedSlug.length > 0) {
    data.slug = normalizedSlug
  }

  try {
    const existing = await prisma.trackingLink.findFirst({
      where: { id, userId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: "Link não encontrado" }, { status: 404 })
    }

    const link = await prisma.trackingLink.update({
      where: { id },
      data,
    })

    return NextResponse.json({ link })
  } catch (err: unknown) {
    console.error("[PATCH /api/links] update error:", err)

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Slug já existe" }, { status: 409 })
    }

    return NextResponse.json(
      { error: "Erro ao editar link" },
      { status: 500 }
    )
  }
}