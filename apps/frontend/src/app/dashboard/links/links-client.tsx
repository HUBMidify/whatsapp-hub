"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { Pencil, Archive, RotateCcw, BarChart3 } from "lucide-react"

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
//Criar Hook de fetch
type MetricsOverview = {
  totalClicks: number
  channels: {
    meta: number
    google: number
    social: number
    other: number
    untracked: number
  }
}

type MetricsByLink = {
  id: string
  name: string
  slug: string
  totalClicks: number
  channels: MetricsOverview["channels"]
}


type MetricsResponse = {
  overview: MetricsOverview
  byLink: MetricsByLink[]
}

// Helper to build "link de divulgação" (destination URL + UTMs)
function buildCampaignUrl(
  redirectUrl: string,
  utmSource?: string | null,
  utmCampaign?: string | null
) {
  try {
    const url = new URL(redirectUrl)

    if (utmSource && utmSource.trim() !== "") {
      url.searchParams.set("utm_source", utmSource.trim())
    }
    if (utmCampaign && utmCampaign.trim() !== "") {
      url.searchParams.set("utm_campaign", utmCampaign.trim())
    }

    return url.toString()
  } catch {
    // If redirectUrl is not a valid URL, return as-is (avoid crashing UI)
    return redirectUrl
  }
}

export default function LinksClient() {
  const [tab, setTab] = useState<Tab>("active")
  const [links, setLinks] = useState<TrackingLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null) //State para métricas
  const [loadingMetrics, setLoadingMetrics] = useState(true) //State para loading das métricas

  //Criar a função openEdit
  const [isEditing, setIsEditing] = useState(false)

  function openEdit(link: TrackingLink) {
  setOpen(true)
  setIsEditing(true)
  setCreatedLink(link) // para ter o id disponível
  setStep(1)

  setName(link.name ?? "")
  setSlug(link.slug ?? "")
  setRedirectUrl(link.redirectUrl ?? "")
  setWhatsappNumber(link.whatsappNumber ?? "")
  setPreFilledMessage(link.preFilledMessage ?? "")
  setUtmSource(link.utmSource ?? "")
  setUtmCampaign(link.utmCampaign ?? "")
}

  // Modal criar
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [redirectUrl, setRedirectUrl] = useState("")
  const [whatsappNumber, setWhatsappNumber] = useState("")
  const [preFilledMessage, setPreFilledMessage] = useState("")
  const [utmSource, setUtmSource] = useState("")
  const [utmCampaign, setUtmCampaign] = useState("")
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [createdLink, setCreatedLink] = useState<TrackingLink | null>(null)

  const [origin, setOrigin] = useState("")

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

  //useEffect para carregar métricas
  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await apiFetch("/api/links/metrics", { method: "GET" })

        if (!res.ok) throw new Error("Erro ao buscar métricas")

        const data: MetricsResponse = await res.json()
        setMetrics(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingMetrics(false)
      }
    }

    fetchMetrics()
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [])
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

      setCreatedLink(data.link)
      setStep(3)

      // volta para ativos e recarrega
      setTab("active")
      await loadLinks()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  async function updateLink(id: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/links", {
        method: "PATCH",
        body: JSON.stringify({
          id,
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
      if (!res.ok) throw new Error(data?.error ?? "Erro ao editar link")

      // Recarrega lista
      setTab("active")
      await loadLinks()

      // Fecha modal e reseta estado de edição
      setOpen(false)
      setIsEditing(false)
      setStep(1)
      setCreatedLink(null)

      setName("")
      setSlug("")
      setRedirectUrl("")
      setWhatsappNumber("")
      setPreFilledMessage("")
      setUtmSource("")
      setUtmCampaign("")
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

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewLink, setViewLink] = useState<TrackingLink | null>(null)

  function getClicksForLink(linkId: string) {
    const found = metrics?.byLink.find((m) => m.id === linkId)
    return found?.totalClicks ?? 0
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Links rastreados</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crie links para rastrear origem e atribuição.
          </p>
        </div>

        <button
          className="btn-primary disabled:opacity-50"
          onClick={() => setOpen(true)}
          disabled={loading}
        >
          Criar link
        </button>
      </div>

      <div className="inline-flex gap-2 rounded-xl bg-muted p-1 border border-border">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "active"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-background"
          }`}
          onClick={() => setTab("active")}
          disabled={loading}
        >
          Ativos
        </button>

        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "archived"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-background"
          }`}
          onClick={() => setTab("archived")}
          disabled={loading}
        >
          Arquivados
        </button>
      </div>

      {loadingMetrics && (
        <div className="text-sm text-muted-foreground">Carregando métricas...</div>
      )}

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <MetricCard label="Total" value={metrics.overview.totalClicks} />
          <MetricCard label="Meta Ads" value={metrics.overview.channels.meta} />
          <MetricCard label="Google Ads" value={metrics.overview.channels.google} />
          <MetricCard label="Redes Sociais" value={metrics.overview.channels.social} />
          <MetricCard label="Outras Origens" value={metrics.overview.channels.other} />
          <MetricCard label="Não rastreado" value={metrics.overview.channels.untracked} />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm text-muted-foreground">
          {loading ? "Carregando..." : `${links.length} link(s)`}
        </div>

        <ul className="divide-y">
          {links.map((l) => (
            <Fragment key={l.id}>
              <li
                className="px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <button
                    className="font-medium text-foreground truncate text-left hover:underline"
                    onClick={() => setViewLink(l)}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="truncate">{l.name}</span>
                      {metrics && (
                        <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground shrink-0">
                          {getClicksForLink(l.id)} cliques
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="text-sm text-muted-foreground truncate">
                    <span className="font-mono">/{l.slug}</span> → {l.redirectUrl}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                    onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                    title="Métricas"
                    aria-label="Métricas"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>

                  <button
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                    onClick={() => openEdit(l)}
                    disabled={loading}
                    title="Editar"
                    aria-label="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {tab === "active" ? (
                    <button
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                      onClick={() => {
                        const ok = confirm("Arquivar este link?")
                        if (ok) archiveLink(l.id)
                      }}
                      disabled={loading}
                      title="Arquivar"
                      aria-label="Arquivar"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                      onClick={() => restoreLink(l.id)}
                      disabled={loading}
                      title="Restaurar"
                      aria-label="Restaurar"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
              {expandedId === l.id && metrics && (
                <li className="px-4 py-4 bg-muted/50">
                  {(() => {
                    const linkMetrics = metrics.byLink.find(m => m.id === l.id)
                    if (!linkMetrics) return <div className="text-sm text-muted-foreground">Sem dados</div>

                    return (
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                        <div>Total: {linkMetrics.totalClicks}</div>
                        <div>Meta: {linkMetrics.channels.meta}</div>
                        <div>Google: {linkMetrics.channels.google}</div>
                        <div>Social: {linkMetrics.channels.social}</div>
                        <div>Other: {linkMetrics.channels.other}</div>
                        <div>Untracked: {linkMetrics.channels.untracked}</div>
                      </div>
                    )
                  })()}
                </li>
              )}
            </Fragment>
          ))}

          {!loading && links.length === 0 && (
            <li className="px-4 py-10 text-sm text-muted-foreground">
              Nenhum link encontrado.
            </li>
          )}
        </ul>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg card space-y-4">

            <div className="flex items-center justify-between">
              <div className="font-semibold text-foreground">
                {isEditing
                  ? `Editar link — Etapa ${step} de 3`
                  : `Criar link — Etapa ${step} de 3`}
              </div>
              <button
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => {
                 setOpen(false)
                 setStep(1)
                 setCreatedLink(null)
                 setIsEditing(false)
                }}
                >
                Fechar
              </button>
            </div>

            {/* Step Timeline */}
            <div className="flex items-start justify-between pt-2">
              {[
                { step: 1, label: "Campanha" },
                { step: 2, label: "WhatsApp" },
                { step: 3, label: "Copiar" },
              ].map(({ step: s, label }) => (
                <div key={s} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-medium border transition-all duration-300
                        ${
                          step === s
                            ? "bg-primary text-primary-foreground border-primary"
                            : step > s
                            ? "bg-primary/20 text-primary border-primary/40"
                            : "bg-background text-muted-foreground border-border"
                        }
                      `}
                    >
                      {s}
                    </div>
                    <span
                      className={`mt-1 text-[11px] transition-all duration-300
                        ${
                          step === s
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        }
                      `}
                    >
                      {label}
                    </span>
                  </div>

                  {s !== 3 && (
                    <div
                      className={`flex-1 h-[2px] mx-2 transition-all duration-300
                        ${step > s ? "bg-primary" : "bg-border"}
                      `}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4">
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Etapa 1 — Link de divulgação (campanha)
                </p>

                <input
                  className="input"
                  placeholder="Nome (ex: Promo Verão)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <input
                  className="input"
                  placeholder="Slug (ex: promo-verao)"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />

                <input
                  className="input"
                  placeholder="URL de destino (https://...)"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    placeholder="utm_source (opcional)"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="utm_campaign (opcional)"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    className="btn-primary disabled:opacity-50"
                    onClick={() => setStep(2)}
                    disabled={!name || !slug || !redirectUrl}
                  >
                    Próxima etapa →
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Etapa 2 — Configuração do WhatsApp
                </p>

                <input
                  type="text"
                  placeholder="WhatsApp (ex: 5521999999999)"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="input"
                />

                <textarea
                  className="input"
                  placeholder="Mensagem pré-preenchida (opcional)"
                  value={preFilledMessage}
                  onChange={(e) => setPreFilledMessage(e.target.value)}
                />

                <div className="flex justify-between pt-2">
                  <button
                    className="btn-secondary"
                    onClick={() => setStep(1)}
                  >
                    ← Voltar
                  </button>

                  <button
                    className="btn-primary disabled:opacity-50"
                    onClick={() => {
                     if (isEditing && createdLink?.id) {
                      updateLink(createdLink.id)
                     } else {
                      createLink()
                    }
                    }}
                    disabled={loading || !whatsappNumber || step !== 2}
                  >
                    {isEditing ? "Salvar alterações →" : "Criar link →"}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && createdLink && !isEditing && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Etapa 3 — Links prontos para copiar
                </p>

                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Link de campanha
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={buildCampaignUrl(
                        createdLink.redirectUrl,
                        createdLink.utmSource,
                        createdLink.utmCampaign
                      )}
                      className="input text-sm"
                    />
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          buildCampaignUrl(
                            createdLink.redirectUrl,
                            createdLink.utmSource,
                            createdLink.utmCampaign
                          )
                        )
                      }
                    >
                      Copiar
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Link do WhatsApp rastreado
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${origin}/track/${createdLink.slug}`}
                      className="input text-sm"
                    />
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        navigator.clipboard.writeText(`${origin}/track/${createdLink.slug}`)
                      }
                      disabled={!origin}
                    >
                      Copiar
                    </button>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    className="btn-secondary"
                    onClick={() => setStep(2)}
                  >
                    ← Voltar
                  </button>

                  <button
                    className="btn-primary"
                    onClick={() => {
                      setCreatedLink(null)
                      setStep(1)
                      setOpen(false)

                      // reset form fields for next creation
                      setName("")
                      setSlug("")
                      setRedirectUrl("")
                      setWhatsappNumber("")
                      setPreFilledMessage("")
                      setUtmSource("")
                      setUtmCampaign("")
                    }}
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}

            </div>
          </div>
        </div>
      )}
      {viewLink && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg card space-y-4">

            <div className="flex items-center justify-between">
              <div className="font-semibold text-foreground">
                Detalhes do link
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (viewLink) openEdit(viewLink)
                    setViewLink(null)
                  }}
                >
                  Editar
                </button>
                <button
                  className="text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setViewLink(null)}
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Slug</p>
                <p className="font-mono">/track/{viewLink.slug}</p>
              </div>

              <div>
                <p className="text-muted-foreground">URL de destino</p>
                <p className="break-all">{viewLink.redirectUrl}</p>
              </div>

              <div>
                <p className="text-muted-foreground">WhatsApp</p>
                <p>{viewLink.whatsappNumber ?? "Não configurado"}</p>
              </div>

              <div>
                <p className="text-muted-foreground">Mensagem</p>
                <p>{viewLink.preFilledMessage ?? "—"}</p>
              </div>

              {/* Link de divulgação (campanha) section */}
              <div>
                <p className="text-muted-foreground">Link de divulgação (campanha)</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={buildCampaignUrl(
                      viewLink.redirectUrl,
                      viewLink.utmSource,
                      viewLink.utmCampaign
                    )}
                    className="input text-xs"
                  />
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        buildCampaignUrl(
                          viewLink.redirectUrl,
                          viewLink.utmSource,
                          viewLink.utmCampaign
                        )
                      )
                    }
                  >
                    Copiar
                  </button>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground">Link do WhatsApp rastreado</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${origin}/track/${viewLink.slug}`}
                    className="input text-xs"
                  />
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${origin}/track/${viewLink.slug}`
                      )
                    }
                  >
                    Copiar
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  )
}