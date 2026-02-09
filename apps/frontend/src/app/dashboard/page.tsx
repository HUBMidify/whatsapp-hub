import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ConversationsTable } from './ConversationsTable'

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

    return {
      id: first.leadId,
      name: first.lead.name || formatPhone(first.lead.phone),
      origin: last.matchMethod || "ORGÂNICO",
      firstMessageAt: first.createdAt,
      lastMessageAt: last.createdAt,
    }
  })

  return (
    <div style={{ padding: 40 }}>
      <div style={navStyles.container}>
  <a href="/dashboard" style={navStyles.link}>
    📋 Conversas
  </a>

  <a href="/dashboard/whatsapp/connect" style={navStyles.link}>
    🔗 Conectar WhatsApp
  </a>
</div>
      <h1>Conversas WhatsApp</h1>

      <ConversationsTable rows={rows} />
    </div>
  )
}

/* ================= Helpers ================= */

function formatDate(date: Date) {
  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })
}

function formatPhone(phone: string): string {
  const match = phone.match(/^55(\d{2})(\d{5})(\d{4})$/)
  if (!match) return phone
  return `+55 (${match[1]}) ${match[2]}-${match[3]}`
}

const styles = {
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginTop: 20,
  },
}

const navStyles = {
  container: {
    display: 'flex',
    gap: 16,
    marginBottom: 24,
  },
  link: {
    textDecoration: 'none',
    fontWeight: 'bold',
    color: '#2563eb',
    cursor: 'pointer',
  },
}