'use client'

import { useEffect, useState, type CSSProperties } from 'react'

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
    <div style={styles.page}>
      <div style={navStyles.container}>
  <a href="/dashboard" style={navStyles.link}>
    📋 Conversas
  </a>

  <a href="/dashboard/whatsapp/connect" style={navStyles.link}>
    🔗 Conectar WhatsApp
  </a>
</div>
      <h1 style={styles.title}>Conectar WhatsApp</h1>
      <p style={styles.subtitle}>
        Escaneie o QR Code com seu WhatsApp Business
      </p>

      <div style={styles.card}>
        <h2>Conexão WhatsApp</h2>
        <p>Gere e escaneie o QR Code para conectar</p>

        <button
          onClick={generateQRCode}
          disabled={connectionStatus === 'loading'}
          style={styles.button}
        >
          {connectionStatus === 'loading' ? 'Gerando QR Code...' : 'Gerar QR Code'}
        </button>

       {qrCode && (
         <img
           src={qrCode}
           alt="QR Code WhatsApp"
           style={{ width: 300, height: 300 }}
         />
       )}

        <div style={styles.status}>
          {connectionStatus === 'idle' && <p>Clique no botão para gerar o QR Code</p>}
          {connectionStatus === 'loading' && <p>Aguardando conexão...</p>}
          {connectionStatus === 'connected' && <p>✅ WhatsApp conectado!</p>}
          {connectionStatus === 'connected' && (<p style={{ marginTop: 12, color: 'green' }}>Você já pode fechar esta página 👍</p>)}
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '40px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f5f7fb',
    textAlign: 'center',
  },
  title: {
    fontSize: '32px',
    marginBottom: '10px',
  },
  subtitle: {
    color: '#555',
    marginBottom: '30px',
  },
  card: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '30px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  button: {
  marginTop: '20px',
  padding: '14px 28px',
  fontSize: '16px',
  fontWeight: 'bold',
  cursor: 'pointer',
  backgroundColor: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  transition: 'background-color 0.2s ease',
},
  qrBox: {
    marginTop: '20px',
  },
  status: {
    marginTop: '20px',
    fontWeight: 'bold',
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