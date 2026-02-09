'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Row = {
  id: string
  name: string
  origin: string
  firstMessageAt: Date
  lastMessageAt: Date
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

  return (
    <>
      {/* Filtros */}
      <div style={styles.filters}>
        <input
          placeholder="Buscar por nome ou origem"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
          <option value="">Todas as origens</option>
          <option value="FBCLID">FBCLID</option>
          <option value="PHONE">PHONE</option>
          <option value="MANUAL">MANUAL</option>
          <option value="ORGANIC">ORGANIC</option>
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        <button onClick={clearFilters}>Limpar filtros</button>
      </div>

      {/* Tabela */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Origem</th>
            <th>Primeira Mensagem</th>
            <th>Última Mensagem</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.origin}</td>
              <td>{format(row.firstMessageAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}</td>
              <td>{format(row.lastMessageAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const styles = {
  filters: {
    display: 'flex',
    gap: 10,
    marginBottom: 20,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
}