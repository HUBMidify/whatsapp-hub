"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Pencil, Archive, RotateCcw, BarChart3 } from "lucide-react"

type TrackingLink = {
  id: string
  name: string
  slug: string
  platform: string | null
  destinationUrl: string | null
  whatsappNumber: string | null
  preFilledMessage: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
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
  destinationUrl: string | null | undefined,
  utms: {
    utmSource?: string | null
    utmMedium?: string | null
    utmCampaign?: string | null
    utmTerm?: string | null
    utmContent?: string | null
  }
) {
  const base = (destinationUrl ?? "").trim()
  if (!base) return ""

  try {
    const url = new URL(base)

    const setIfFilled = (key: string, value?: string | null) => {
      const v = (value ?? "").trim()
      if (v) url.searchParams.set(key, v)
    }

    setIfFilled("utm_source", utms.utmSource)
    setIfFilled("utm_medium", utms.utmMedium)
    setIfFilled("utm_campaign", utms.utmCampaign)
    setIfFilled("utm_term", utms.utmTerm)
    setIfFilled("utm_content", utms.utmContent)

    return url.toString()
  } catch {
    return base
  }
}

function slugify(input: string) {
  return String(input)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9-_\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function formatDateBR(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR")
}

export default function LinksClient() {
  const [tab, setTab] = useState<Tab>("active")
  const [links, setLinks] = useState<TrackingLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null) //State para métricas
  const [loadingMetrics, setLoadingMetrics] = useState(true) //State para loading das métricas
  const [search, setSearch] = useState("")
  const [platformFilter, setPlatformFilter] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Estados do WhatsApp + função de fetch do link para edição
  type WhatsAppStatus = {
    status?: string
    connected: boolean
    whatsappNumber?: string | null
    whatsappJid?: string | null
  }

  function extractOfficialWhatsAppNumber(s: WhatsAppStatus | null | undefined) {
    const jid = (s?.whatsappJid ?? "").trim()
    if (jid) {
      // Examples: "5521999391590:10@s.whatsapp.net" or "5521999391590@s.whatsapp.net"
      const beforeAt = jid.split("@")[0] ?? ""
      const beforeDevice = beforeAt.split(":")[0] ?? ""
      const digits = beforeDevice.replace(/\D/g, "")
      if (digits) return digits
    }

    const raw = (s?.whatsappNumber ?? "").trim()
    if (!raw) return ""

    // If it comes already with device suffix, remove non-digits then try to drop common suffix patterns.
    const digits = raw.replace(/\D/g, "")
    return digits
  }

  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [loadingWaStatus, setLoadingWaStatus] = useState(false)

  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      setLoadingWaStatus(true)

      const res = await apiFetch("/api/whatsapp/status", { method: "GET" })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error ?? "Erro ao buscar status do WhatsApp")
      }

      const normalized: WhatsAppStatus = {
        connected: Boolean(data.connected),
        status: typeof data.status === "string" ? data.status : undefined,
        whatsappNumber: typeof data.whatsappNumber === "string" ? data.whatsappNumber : null,
        whatsappJid: typeof data.whatsappJid === "string" ? data.whatsappJid : null,
      }

      setWaStatus(normalized)

      // Fonte oficial: sempre usar o número do WhatsApp conectado (derivado do JID quando disponível)
      if (normalized.connected) {
        const official = extractOfficialWhatsAppNumber(normalized)
        if (official) setWhatsappNumber(official)
      }

      return normalized
    } catch (e) {
      console.error(e)
      setWaStatus({ connected: false, whatsappNumber: null, whatsappJid: null })
      return null
    } finally {
      setLoadingWaStatus(false)
    }
  }, [])

  //Criar a função openEdit
  const [isEditing, setIsEditing] = useState(false)

  function openEdit(link: TrackingLink) {
    setOpen(true)
    setIsEditing(true)
    setCreatedLink(link) // para ter o id disponível
    setStep(1)

    setName(link.name ?? "")
    setSlug(link.slug ?? "")
    setSlugManuallyEdited(true)
    setPlatform(link.platform ?? "")
    setDestinationUrl(link.destinationUrl ?? "")
    setWhatsappNumber(link.whatsappNumber ?? "")
    setPreFilledMessage(link.preFilledMessage ?? "")
    setUtmSource(link.utmSource ?? "")
    setUtmMedium(link.utmMedium ?? "")
    setUtmCampaign(link.utmCampaign ?? "")
    setUtmTerm(link.utmTerm ?? "")
    setUtmContent(link.utmContent ?? "")
  }

  // Modal criar
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [platform, setPlatform] = useState("")
  const [destinationUrl, setDestinationUrl] = useState("")
  const [whatsappNumber, setWhatsappNumber] = useState("")
  const [preFilledMessage, setPreFilledMessage] = useState("")
  const [utmSource, setUtmSource] = useState("")
  const [utmMedium, setUtmMedium] = useState("")
  const [utmCampaign, setUtmCampaign] = useState("")
  const [utmTerm, setUtmTerm] = useState("")
  const [utmContent, setUtmContent] = useState("")
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [createdLink, setCreatedLink] = useState<TrackingLink | null>(null)

  const [origin, setOrigin] = useState("")

  const query = useMemo(
    () => (tab === "archived" ? "?archived=true" : ""),
    [tab]
  )

  const clearFilters = () => {
    setSearch("")
    setPlatformFilter("")
    setStartDate("")
    setEndDate("")
  }

  const filteredLinks = useMemo(() => {
    const s = search.trim().toLowerCase()

    return links.filter((l) => {
      const nameMatch = (l.name ?? "").toLowerCase().includes(s)
      const slugMatch = (l.slug ?? "").toLowerCase().includes(s)
      const searchMatch = !s ? true : nameMatch || slugMatch

      const platformMatch = platformFilter ? (l.platform ?? "") === platformFilter : true

      const created = new Date(l.createdAt)
      const startMatch = startDate ? created >= new Date(startDate) : true
      const endMatch = endDate ? created <= new Date(endDate + "T23:59:59.999") : true

      return searchMatch && platformMatch && startMatch && endMatch
    })
  }, [links, search, platformFilter, startDate, endDate])

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

  useEffect(() => {
    if (slugManuallyEdited) return
    const suggested = slugify(name)
    if (suggested && suggested !== slug) {
      setSlug(suggested)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

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
          platform: platform || null,
          destinationUrl,
          whatsappNumber: whatsappNumber || null,
          preFilledMessage: preFilledMessage || null,
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          utmTerm: utmTerm || null,
          utmContent: utmContent || null,
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
          platform: platform || null,
          destinationUrl,
          whatsappNumber: whatsappNumber || null,
          preFilledMessage: preFilledMessage || null,
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          utmTerm: utmTerm || null,
          utmContent: utmContent || null,
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
      setSlugManuallyEdited(false)
      setPlatform("")
      setDestinationUrl("")
      setWhatsappNumber("")
      setPreFilledMessage("")
      setUtmSource("")
      setUtmMedium("")
      setUtmCampaign("")
      setUtmTerm("")
      setUtmContent("")
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

      {/* Filtros */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Buscar
          </label>
          <input
            className="input"
            placeholder="Buscar por nome ou slug"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="w-full md:w-56">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Plataforma
          </label>

          <div className="relative">
            <select
              className="input w-full h-10 pr-10"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
            >
              <option value="">Todas as plataformas</option>
              <option value="meta">Meta Ads</option>
              <option value="google">Google Ads</option>
              <option value="social">Redes Sociais</option>
              <option value="other">Outras</option>
            </select>

            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
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
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Início
          </label>
          <input
            className="input bg-background"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="w-full md:w-44">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Fim
          </label>
          <input
            className="input bg-background"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <button onClick={clearFilters} className="btn-secondary whitespace-nowrap">
          Limpar filtros
        </button>
      </div>

      <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm text-muted-foreground">
          {loading ? "Carregando..." : `${filteredLinks.length} link(s)`}
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left font-medium px-4 py-3 whitespace-nowrap">Criado em</th>
                <th className="text-left font-medium px-4 py-3">Nome</th>
                <th className="text-left font-medium px-4 py-3 whitespace-nowrap">Slug</th>
                <th className="text-center font-medium px-4 py-3 whitespace-nowrap">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filteredLinks.map((l) => (
                <Fragment key={l.id}>
                  <tr className="hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDateBR(l.createdAt)}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        className="font-medium text-foreground text-left hover:underline"
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
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      <span className="font-mono">/{l.slug}</span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
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
                    </td>
                  </tr>

                  {expandedId === l.id && metrics && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 bg-muted/50">
                        {(() => {
                          const linkMetrics = metrics.byLink.find((m) => m.id === l.id)
                          if (!linkMetrics)
                            return (
                              <div className="text-sm text-muted-foreground">Sem dados</div>
                            )

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
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}

              {!loading && filteredLinks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-sm text-muted-foreground">
                    Nenhum link encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                  onChange={(e) => {
                    setSlugManuallyEdited(true)
                    setSlug(e.target.value)
                  }}
                />

                <select
                  className="input w-full h-10"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  <option value="">Plataforma (opcional)</option>
                  <option value="meta">Meta Ads</option>
                  <option value="google">Google Ads</option>
                  <option value="social">Redes Sociais</option>
                  <option value="other">Outras</option>
                </select>

                <input
                  className="input"
                  placeholder="URL de destino (https://...)"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
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
                    placeholder="utm_medium (opcional)"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="utm_campaign (opcional)"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="utm_term (opcional)"
                    value={utmTerm}
                    onChange={(e) => setUtmTerm(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="utm_content (opcional)"
                    value={utmContent}
                    onChange={(e) => setUtmContent(e.target.value)}
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    className="btn-primary disabled:opacity-50"
                    onClick={async () => {
                      const s = await fetchWhatsAppStatus()
                      setStep(2)
                      if (s?.connected) {
                        const official = extractOfficialWhatsAppNumber(s)
                        if (official) setWhatsappNumber(official)
                      }
                    }}
                    disabled={!name || !slug || !destinationUrl}
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

                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">WhatsApp oficial</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        O número usado aqui é sempre o que estiver conectado no sistema.
                      </p>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => fetchWhatsAppStatus()}
                      disabled={loadingWaStatus}
                    >
                      {loadingWaStatus ? "Verificando..." : "Verificar"}
                    </button>
                  </div>
                  {/*
                    WhatsApp number input (editable) removed.
                    Only the read-only, disabled input below remains.
                  */}
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Número conectado
                    </label>
                    <input
                      readOnly
                      disabled
                      className="input bg-background"
                      value={
                        waStatus?.connected
                          ? extractOfficialWhatsAppNumber(waStatus) || "Não conectado"
                          : "Não conectado"
                      }
                    />
                  </div>
                  {!waStatus?.connected && (
                    <div className="mt-3 text-xs text-destructive">
                      Conecte seu WhatsApp para gerar o link rastreado.
                      <span className="text-muted-foreground"> (Dashboard → WhatsApp → Conectar)</span>
                    </div>
                  )}
                </div>

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
                      if (waStatus?.connected) {
                        const official = extractOfficialWhatsAppNumber(waStatus)
                        if (official) setWhatsappNumber(official)
                      }

                      if (isEditing && createdLink?.id) {
                        updateLink(createdLink.id)
                      } else {
                        createLink()
                      }
                    }}
                    disabled={loading || !waStatus?.connected || !waStatus.whatsappNumber || step !== 2}
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
                      value={buildCampaignUrl(createdLink.destinationUrl, {
                        utmSource: createdLink.utmSource,
                        utmMedium: createdLink.utmMedium,
                        utmCampaign: createdLink.utmCampaign,
                        utmTerm: createdLink.utmTerm,
                        utmContent: createdLink.utmContent,
                      })}
                      className="input text-sm"
                    />
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          buildCampaignUrl(createdLink.destinationUrl, {
                            utmSource: createdLink.utmSource,
                            utmMedium: createdLink.utmMedium,
                            utmCampaign: createdLink.utmCampaign,
                            utmTerm: createdLink.utmTerm,
                            utmContent: createdLink.utmContent,
                          })
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
                      setSlugManuallyEdited(false)
                      setPlatform("")
                      setDestinationUrl("")
                      setWhatsappNumber("")
                      setPreFilledMessage("")
                      setUtmSource("")
                      setUtmMedium("")
                      setUtmCampaign("")
                      setUtmTerm("")
                      setUtmContent("")
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
                <p className="break-all">{viewLink.destinationUrl ?? "—"}</p>
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
                    value={buildCampaignUrl(viewLink.destinationUrl, {
                      utmSource: viewLink.utmSource,
                      utmMedium: viewLink.utmMedium,
                      utmCampaign: viewLink.utmCampaign,
                      utmTerm: viewLink.utmTerm,
                      utmContent: viewLink.utmContent,
                    })}
                    className="input text-xs"
                  />
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        buildCampaignUrl(viewLink.destinationUrl, {
                          utmSource: viewLink.utmSource,
                          utmMedium: viewLink.utmMedium,
                          utmCampaign: viewLink.utmCampaign,
                          utmTerm: viewLink.utmTerm,
                          utmContent: viewLink.utmContent,
                        })
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