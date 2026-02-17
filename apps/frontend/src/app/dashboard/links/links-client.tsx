"use client"

import { useEffect, useMemo, useState } from "react"

type TrackingLink = {
  id: string
  name: string
  slug: string
  redirectUrl: string
  whatsappNumber: string | null
  preFilledMessage: string | null
  utmSource: string | null
  utmCampaign: string | null
  archivedAt: string | null
  createdAt: string
}

type Tab = "active" | "archived"

const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID

async function apiFetch(input: RequestInfo, init?: RequestInit) {
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      "x-user-id": DEV_USER_ID ?? "",
    },
  })
}

export default function LinksClient() {
  const [tab, setTab] = useState<Tab>("active")
  const [links, setLinks] = useState<TrackingLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal criar
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [redirectUrl, setRedirectUrl] = useState("")
  const [whatsappNumber, setWhatsappNumber] = useState("")
  const [preFilledMessage, setPreFilledMessage] = useState("")
  const [utmSource, setUtmSource] = useState("")
  const [utmCampaign, setUtmCampaign] = useState("")

  const query = useMemo(
    () => (tab === "archived" ? "?archived=true" : ""),
    [tab]
  )

  async function loadLinks() {
    setLoading(true)
    setError(null)
    try {
      if (!DEV_USER_ID) {
        throw new Error(
          "NEXT_PUBLIC_DEV_USER_ID não definido. Adicione no .env.local e reinicie o dev server."
        )
      }

      const res = await apiFetch(`/api/links${query}`, { method: "GET" })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error ?? "Erro ao carregar links")
      }

      setLinks(Array.isArray(data.links) ? data.links : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function createLink() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/links", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug,
          redirectUrl,
          whatsappNumber: whatsappNumber || null,
          preFilledMessage: preFilledMessage || null,
          utmSource: utmSource || null,
          utmCampaign: utmCampaign || null,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? "Erro ao criar link")

      // reset
      setOpen(false)
      setName("")
      setSlug("")
      setWhatsappNumber("")
      setRedirectUrl("")
      setPreFilledMessage("")
      setUtmSource("")
      setUtmCampaign("")

      // volta para ativos e recarrega
      setTab("active")
      await loadLinks()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  async function archiveLink(id: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/links/${id}/archive`, { method: "PATCH" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? "Erro ao arquivar")
      await loadLinks()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  async function restoreLink(id: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/links/${id}/restore`, { method: "PATCH" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? "Erro ao restaurar")
      await loadLinks()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Links rastreados</h2>
          <p className="text-sm text-gray-600 mt-1">
            Crie links para rastrear origem e atribuição.
          </p>
        </div>

        <button
          className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-50"
          onClick={() => setOpen(true)}
          disabled={loading}
        >
          Criar link
        </button>
      </div>

      <div className="flex gap-2">
        <button
          className={`px-3 py-1 rounded-md border ${
            tab === "active" ? "bg-black text-white" : "bg-white"
          }`}
          onClick={() => setTab("active")}
          disabled={loading}
        >
          Ativos
        </button>

        <button
          className={`px-3 py-1 rounded-md border ${
            tab === "archived" ? "bg-black text-white" : "bg-white"
          }`}
          onClick={() => setTab("archived")}
          disabled={loading}
        >
          Arquivados
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-md border bg-white">
        <div className="px-4 py-3 border-b text-sm text-gray-600">
          {loading ? "Carregando..." : `${links.length} link(s)`}
        </div>

        <ul className="divide-y">
          {links.map((l) => (
            <li
              key={l.id}
              className="px-4 py-3 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {l.name}
                </div>
                <div className="text-sm text-gray-600 truncate">
                  <span className="font-mono">/{l.slug}</span> → {l.redirectUrl}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                {tab === "active" ? (
                  <button
                    className="px-3 py-1 rounded-md border disabled:opacity-50"
                    onClick={() => {
                      const ok = confirm("Arquivar este link?")
                      if (ok) archiveLink(l.id)
                    }}
                    disabled={loading}
                  >
                    Arquivar
                  </button>
                ) : (
                  <button
                    className="px-3 py-1 rounded-md border disabled:opacity-50"
                    onClick={() => restoreLink(l.id)}
                    disabled={loading}
                  >
                    Restaurar
                  </button>
                )}
              </div>
            </li>
          ))}

          {!loading && links.length === 0 && (
            <li className="px-4 py-8 text-sm text-gray-600">
              Nenhum link encontrado.
            </li>
          )}
        </ul>
      </div>

      {/* Modal Criar Link */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-md shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900">Criar link</div>
              <button
                className="text-sm text-gray-700"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-2">
              <input
                className="border rounded-md p-2"
                placeholder="Nome (ex: Promo Verão)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="border rounded-md p-2"
                placeholder="Slug (ex: promo-verao)"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
              <input
                type="text"
                placeholder="WhatsApp (ex: 5521999999999)"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="border rounded-md p-2 w-full"
              />
              <input
                className="border rounded-md p-2"
                placeholder="URL de destino (https://...)"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
              />
              <textarea
                className="border rounded-md p-2"
                placeholder="Mensagem pré-preenchida (opcional)"
                value={preFilledMessage}
                onChange={(e) => setPreFilledMessage(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  className="border rounded-md p-2"
                  placeholder="utm_source (opcional)"
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                />
                <input
                  className="border rounded-md p-2"
                  placeholder="utm_campaign (opcional)"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-2 rounded-md border"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-2 rounded-md bg-black text-white disabled:opacity-50"
                onClick={createLink}
                disabled={loading || !name || !slug || (!redirectUrl && !whatsappNumber)}
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}