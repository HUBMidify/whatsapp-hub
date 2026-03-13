import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ConversationsTable } from "./ConversationsTable"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return <div>Não autenticado</div>
  }

  // Buscar conversas já ordenadas
  const conversations = await prisma.conversation.findMany({
    include: {
      lead: true,
    },
    orderBy: {
      createdAt: "asc", // importante para primeira mensagem
    },
  })

  // Agrupar por lead
  const conversationsByLead = new Map<string, typeof conversations>()

  conversations.forEach((conv) => {
    if (!conversationsByLead.has(conv.leadId)) {
      conversationsByLead.set(conv.leadId, [])
    }
    conversationsByLead.get(conv.leadId)!.push(conv)
  })

  const rows = Array.from(conversationsByLead.values()).map((convs) => {
    const first = convs[0]
    const last = convs[convs.length - 1]

    const originLabel = first.lead.firstTrackedOriginLabel
    const lastTouchLabel = first.lead.lastTrackedOriginLabel

    return {
      id: first.leadId,
      name: first.lead.name || formatPhone(first.lead.phone),
      origin: formatOriginLabel(originLabel),
      lastTouch: formatOriginLabel(lastTouchLabel),
      matchScore: toMatchScore(last.matchConfidence),
      matchMethodLabel: formatMatchMethod(last.matchMethod),
      firstMessageAt: first.createdAt,
      lastMessageAt: last.createdAt,
    }
  })

  return (
    <div className="space-y-6">
      {/* Header da página */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversas WhatsApp</h1>
          <p className="text-sm text-gray-600 mt-1">
            Visualize e filtre conversas por lead, origem e período.
          </p>
        </div>

        <a href="/dashboard/whatsapp/connect" className="btn-primary">
          Conectar WhatsApp
        </a>
      </div>

      {/* Card com tabela */}
      <div className="card">
        <ConversationsTable rows={rows} />
      </div>
    </div>
  )
}

/* ================= Helpers ================= */

function formatDate(date: Date) {
  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })
}

function formatOriginLabel(label: string | null | undefined): string {
  switch (label) {
    case "GOOGLE_ADS":
      return "Google Ads"
    case "META_ADS":
      return "Meta Ads"
    case "SOCIAL":
      return "Social"
    case "OTHER":
      return "Outros"
    case "UNTRACKED":
      return "Não rastreado"
    case "NEVER_TRACKED":
      return "Nunca rastreado"
    case null:
    case undefined:
      return "Não rastreado"
    default:
      return label.replaceAll("_", " ")
  }
}

function formatMatchMethod(method: string | null | undefined): string {
  switch (method) {
    case "ZERO_WIDTH_EXACT":
      return "Identificação exata"
    case "TEMPORAL_WINDOW":
      return "Janela de tempo"
    case "ORGANIC":
      return "Sem identificação automática"
    case null:
    case undefined:
      return "Não identificado"
    default:
      return method.replaceAll("_", " ")
  }
}

function toMatchScore(confidence: number | null | undefined): number {
  if (confidence == null || Number.isNaN(confidence)) return 0
  const score = Math.round(confidence * 10)
  return Math.max(0, Math.min(10, score))
}

function formatPhone(phone: string): string {
  const match = phone.match(/^55(\d{2})(\d{5})(\d{4})$/)
  if (!match) return phone
  return `+55 (${match[1]}) ${match[2]}-${match[3]}`
}