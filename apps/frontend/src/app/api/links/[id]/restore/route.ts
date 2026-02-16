import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function getUserId(req: Request) {
  return req.headers.get("x-user-id")
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const link = await prisma.trackingLink.findFirst({
    where: {
      id: params.id,
      userId,
      NOT: { archivedAt: null },
    },
  })

  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.trackingLink.update({
    where: { id: link.id },
    data: {
      archivedAt: null,
    },
  })

  return NextResponse.json({ ok: true })
}