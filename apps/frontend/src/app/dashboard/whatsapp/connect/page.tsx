'use client'

import { useEffect, useState } from 'react'

export default function WhatsAppConnect() {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'loading' | 'connected'>('idle')
  const [error, setError] = useState<string | null>(null)

 const generateQRCode = async () => {
  try {
    setConnectionStatus('loading')
    setError(null)
    setQrCode(null)

    const res = await fetch('/api/whatsapp/qrcode')

    if (!res.ok) {
      throw new Error('Erro ao buscar QR Code')
    }

    const data = await res.json()

    if (!data.qrCode) {
      // Já está conectado
      setConnectionStatus('connected')
      return
    }

    setQrCode(data.qrCode)
  } catch (err) {
    setError('Não foi possível gerar o QR Code')
    setConnectionStatus('idle')
  }
}

useEffect(() => {
  if (!qrCode || connectionStatus === 'connected') return

  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()

      if (data.connected) {
        setConnectionStatus('connected')
        setQrCode(null)
        clearInterval(interval)
      }
    } catch {
      // ignora erro
    }
  }, 3000)

  return () => clearInterval(interval)
}, [qrCode, connectionStatus])

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900">Conectar WhatsApp</h1>
          <p className="text-sm text-gray-600 mt-1">
            Escaneie o QR Code com seu WhatsApp Business
          </p>
        </div>

        <a
          href="/dashboard"
          className="btn-secondary absolute right-0 top-0"
        >
          Voltar para conversas
        </a>
      </div>

      <div className="card w-full max-w-md mx-auto aspect-square flex flex-col items-center justify-center text-center gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Conexão WhatsApp</h2>
          <p className="text-sm text-gray-600">
            Gere e escaneie o QR Code para conectar
          </p>
        </div>

        <div>
          <button
            onClick={generateQRCode}
            disabled={connectionStatus === 'loading'}
            className="btn-primary"
          >
            {connectionStatus === 'loading' ? 'Gerando QR Code...' : 'Gerar QR Code'}
          </button>
        </div>

        {qrCode && (
          <div>
            <img
              src={qrCode}
              alt="QR Code WhatsApp"
              className="w-64 h-64"
            />
          </div>
        )}

        <div className="text-sm font-medium">
          {connectionStatus === 'idle' && (
            <p className="text-gray-600">Clique no botão para gerar o QR Code</p>
          )}
          {connectionStatus === 'loading' && (
            <p className="text-gray-600">Aguardando conexão...</p>
          )}
          {connectionStatus === 'connected' && (
            <p className="text-green-700">WhatsApp conectado!</p>
          )}
          {connectionStatus === 'connected' && (
            <p className="text-green-700 mt-2">
              Você já pode fechar esta página
            </p>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
