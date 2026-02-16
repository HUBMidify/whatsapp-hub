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

  const links = await prisma.trackingLink.findMany({
    where: {
      userId,
      archivedAt: null,
    },
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

  const { name, slug, redirectUrl, preFilledMessage, utmSource, utmCampaign } =
    body

  if (!name || !slug || !redirectUrl) {
    return NextResponse.json(
      { error: "Campos obrigatórios: name, slug, redirectUrl" },
      { status: 400 }
    )
  }

  const normalizedSlug = String(slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  try {
    const link = await prisma.trackingLink.create({
      data: {
        userId,
        name,
        slug: normalizedSlug,
        redirectUrl,
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