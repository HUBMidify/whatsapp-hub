import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: { leadId: string } }
) {
  const { leadId } = params

  if (!leadId) {
    return NextResponse.json({ error: 'leadId ausente' }, { status: 400 })
  }

  const messages = await prisma.conversation.findMany({
    where: { leadId },
    orderBy: { createdAt: 'asc' },
    take: 30, // últimas 30 mensagens (demo/performance)
    select: {
      id: true,
      messageText: true,
      createdAt: true,
      matchMethod: true,
    },
  })

  return NextResponse.json(messages)
}