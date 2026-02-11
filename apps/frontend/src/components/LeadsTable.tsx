'use client'

import { useMemo, useState } from 'react'

type LeadMessage = {
  id: string
  text: string
  createdAt: Date | string
  direction?: 'in' | 'out'
}

export type LeadRow = {
  id: string
  name: string
  phone: string
  origem: string
  firstMessageAt: Date | string
  lastMessageAt: Date | string
  totalMessages: number
  lastMessage: string
  // opcional: se você já tiver mensagens pra mostrar no slide
  messages?: LeadMessage[]
}

export default function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)

  const selectedMessages = useMemo(() => {
    if (!selectedLead?.messages) return []
    // garante ordenação e limita (pra demo ficar leve)
    return [...selectedLead.messages]
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
      .slice(-20)
  }, [selectedLead])

  return (
    <>
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Últimas Conversas ({leads.length})
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Nome
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Telefone
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Origem
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Última atividade
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-500">
                    Nenhuma conversa ainda
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-semibold text-sm">
                            {(lead.name?.[0] || '?').toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {lead.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-sm text-gray-600">
                      {formatPhone(lead.phone)}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {lead.origem}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-sm text-gray-600">
                      {formatRelativeTime(lead.lastMessageAt)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedLead(lead)}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-gray-100 text-primary-600 hover:text-primary-700 transition-colors"
                        title="Ver conversa"
                        type="button"
                      >
                        {/* ícone olho */}
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-in lateral */}
      {selectedLead && (
        <div
          className="fixed inset-0 bg-black/20 z-50"
          onClick={() => setSelectedLead(null)}
        >
          <div
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedLead.name}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {formatPhone(selectedLead.phone)} • {selectedLead.origem}
                </p>
              </div>

              <button
                onClick={() => setSelectedLead(null)}
                className="w-9 h-9 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                type="button"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <div className="text-sm text-gray-600 mb-3">
                Última mensagem:
              </div>
              <div className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg p-4">
                {selectedLead.lastMessage || '—'}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-900 mb-3">
                  Mensagens recentes
                </p>

                {selectedMessages.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    (placeholder) Nenhuma mensagem carregada para este lead.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedMessages.map((m) => {
                      const isOut = m.direction === 'out'
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm border ${
                            isOut
                              ? 'ml-auto bg-primary-50 border-primary-100'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="text-gray-900">{m.text}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDateTime(m.createdAt)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <p className="text-gray-500 text-xs mt-6">
                  Histórico completo pode ser implementado na próxima sprint.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* Helpers */
function formatPhone(phone: string): string {
  const cleaned = (phone || '').replace(/\D/g, '')
  // 55 + DDD + 9 dígitos = 13
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(
      4,
      9
    )}-${cleaned.slice(9)}`
  }
  return phone
}

function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `Há ${minutes}min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Há ${hours}h`

  const days = Math.floor(hours / 24)
  return `Há ${days}d`
}

function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}