'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Row = {
  id: string
  name: string
  origin: string
  firstMessageAt: Date
  lastMessageAt: Date
}
type Message = {
  id: string
  messageText: string
  createdAt: string
  matchMethod?: string | null
}

export function ConversationsTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState('')
  const [origin, setOrigin] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const filteredRows = rows.filter((row) => {
    const searchMatch =
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.origin.toLowerCase().includes(search.toLowerCase())

    const originMatch = origin ? row.origin === origin : true

    const startMatch = startDate
      ? new Date(row.firstMessageAt) >= new Date(startDate)
      : true

    const endMatch = endDate
      ? new Date(row.lastMessageAt) <= new Date(endDate)
      : true

    return searchMatch && originMatch && startMatch && endMatch
  })

  const clearFilters = () => {
    setSearch('')
    setOrigin('')
    setStartDate('')
    setEndDate('')
  }
 //Fecha com Animação 
const closePanel = () => {
  setIsPanelOpen(false)
  setTimeout(() => setSelectedRow(null), 180) // tempo da animação
}

  const [selectedRow, setSelectedRow] = useState<Row | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  
  //Travar Scroll quando abrir o painel de ações
  useEffect(() => {
  if (!selectedRow) return

  const prev = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  return () => {
    document.body.style.overflow = prev
  }
}, [selectedRow])

// Abrir o painel via useEffect
useEffect(() => {
  if (!selectedRow) return

  // abre o painel no próximo frame → animação funciona
  requestAnimationFrame(() => {
    setIsPanelOpen(true)
  })
}, [selectedRow])

  return (
  <>
    {/* Filtros */}
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4 mb-6">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Buscar
        </label>
        <input
          className="input"
          placeholder="Buscar por nome ou origem"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

   <div className="w-full md:w-56">
  <label className="block text-xs font-medium text-gray-600 mb-1">
    Origem
  </label>

  <div className="relative">
    <select
      className="w-full appearance-none px-4 py-2 pr-10 border border-gray-300 rounded-lg
                 bg-white text-gray-900
                 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      value={origin}
      onChange={(e) => setOrigin(e.target.value)}
    >
      <option value="">Todas as origens</option>
      <option value="FBCLID">FBCLID</option>
      <option value="PHONE">PHONE</option>
      <option value="MANUAL">MANUAL</option>
      <option value="ORGANIC">ORGANIC</option>
    </select>

    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  </div>
</div>

      <div className="w-full md:w-44">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Início
        </label>
        <input
          className="input bg-white"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div className="w-full md:w-44">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Fim
        </label>
        <input
          className="input bg-white"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <button onClick={clearFilters} className="btn-secondary whitespace-nowrap">
        Limpar filtros
      </button>
    </div>

    {/* Tabela */}
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
              Nome
            </th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
              Origem
            </th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
              Primeira Mensagem
            </th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
              Última Mensagem
            </th>
            <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                Nenhum resultado com os filtros atuais
              </td>
            </tr>
          ) : (
            filteredRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="py-3 px-4 text-sm font-medium text-gray-900">
                  {row.name}
                </td>

                <td className="py-3 px-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {row.origin}
                  </span>
                </td>

                <td className="py-3 px-4 text-sm text-gray-600">
                  {format(row.firstMessageAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </td>

                <td className="py-3 px-4 text-sm text-gray-600">
                  {format(row.lastMessageAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </td>
                 <td className="py-3 px-4 text-center">
                  <button
                     type="button"
                     onClick={async () => { //Onclick do botão de Ações
                       setSelectedRow(row)
                       setMessages([])                      
                       setLoadingMessages(true)
                       
                       try {
                         const res = await fetch(`/api/leads/${row.id}/messages`)
                         const data: Message[] = await res.json()
                         setMessages(data)
                       } catch (err) {
                       console.error(err)
                       setMessages([])
                       } finally {
                       setLoadingMessages(false)
                       }
                     }}                    
                     className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-gray-100 text-primary-600 hover:text-primary-700 transition-colors"
                     title="Ver conversa">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path
                     strokeLinecap="round"
                     strokeLinejoin="round"
                     strokeWidth={2}
                     d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                   <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                  </button>
                </td> 
              </tr>       
            ))
          )}
        </tbody>
      </table>
    </div>
    {selectedRow && (
  <div
    className="fixed inset-0 bg-black/20 z-50"
    onClick={closePanel}
  >
    <div
      className={`fixed right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-xl overflow-y-auto
  transform transition-transform duration-200 ease-out
  ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {selectedRow.name}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Origem: {selectedRow.origin}
          </p>
        </div>

        <button
          type="button"
          onClick={closePanel}
          className="w-9 h-9 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="p-6">
        <p className="text-sm text-gray-600 mb-3">Mensagens recentes</p>

        {loadingMessages ? ( //Loading de mensagens
  <div className="space-y-3"> 
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="border border-gray-200 rounded-lg p-3 bg-gray-50"
      >
        <div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse mt-2" />
      </div>
    ))}
  </div>
) : messages.length === 0 ? (
  <p className="text-sm text-gray-500">
    Nenhuma mensagem encontrada para este lead.
  </p>
) : (
  <div className="space-y-3">
  {messages.map((msg) => {
    const isOutbound = msg.matchMethod === 'MANUAL'

    return (
      <div
        key={msg.id}
        className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm border ${
            isOutbound
              ? 'bg-primary-50 border-primary-100 text-gray-900'
              : 'bg-gray-50 border-gray-200 text-gray-900'
          }`}
        >
          <p>{msg.messageText}</p>
          <p className="text-xs text-gray-500 mt-1 text-right">
            {new Date(msg.createdAt).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
    )
  })}
</div>
)}

        <p className="text-xs text-gray-500 mt-4"> {/*notificação no rodapé do painel*/}
          
        </p>
      </div>
    </div>
  </div>
)}
  </>
)
}