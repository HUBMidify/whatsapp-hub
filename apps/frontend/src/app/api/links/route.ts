import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function getUserId(req: Request) {
  return req.headers.get("x-user-id")
}

// LISTAR LINKS (somente não arquivados)
export async function GET(req: Request) {
  const userId = getUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
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
export async function POST(req: Request) {
  const userId = getUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    name,
    slug,
    redirectUrl,
    whatsappNumber,
    preFilledMessage,
    utmSource,
    utmCampaign,
  } = body

  const hasRedirectUrl = typeof redirectUrl === "string" && redirectUrl.trim() !== ""
const hasWhatsappNumber =
  typeof whatsappNumber === "string" && whatsappNumber.trim() !== ""

if (!name || !slug || (!hasRedirectUrl && !hasWhatsappNumber)) {
  return NextResponse.json(
    { error: "Campos obrigatórios: name, slug e (redirectUrl ou whatsappNumber)" },
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
        redirectUrl: hasRedirectUrl ? redirectUrl.trim() : "https://wa.me/",
        whatsappNumber: normalizedWhatsappNumber,
        preFilledMessage: preFilledMessage ?? null,
        utmSource: utmSource ?? null,
        utmCampaign: utmCampaign ?? null,
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