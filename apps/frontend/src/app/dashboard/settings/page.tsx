"use client"

import { useMemo, useState } from "react"

type TabKey = "integrations" | "profile"

type InstallMode = "html" | "gtm"

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("integrations")
  const [pixelModalOpen, setPixelModalOpen] = useState(false)
  const [installMode, setInstallMode] = useState<InstallMode>("html")
  const [copied, setCopied] = useState<null | "snippet" | "link">(null)

  const pixelJsUrl = useMemo(() => {
    // In production this will resolve to your app domain.
    // In local dev this becomes http://localhost:3000/pixel.js
    if (typeof window === "undefined") return "/pixel.js"
    return new URL("/pixel.js", window.location.origin).toString()
  }, [])

  const installSnippet = useMemo(() => {
    return `<!-- Midify Connect Pixel -->\n<script async src="${pixelJsUrl}"></script>`
  }, [pixelJsUrl])

  async function copy(text: string, which: "snippet" | "link") {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 1400)
    } catch {
      // Fallback: do nothing (user can copy manually)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>
        <p className="text-sm text-gray-600 mt-1">
          Perfil, integrações e preferências.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("integrations")}
          className={classNames(
            "px-3 py-2 text-sm font-medium -mb-px border-b-2 transition",
            tab === "integrations"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-600 hover:text-gray-900"
          )}
        >
          Integrações
        </button>
        <button
          type="button"
          onClick={() => setTab("profile")}
          className={classNames(
            "px-3 py-2 text-sm font-medium -mb-px border-b-2 transition",
            tab === "profile"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-600 hover:text-gray-900"
          )}
        >
          Perfil
        </button>
      </div>

      {tab === "integrations" ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Canais de integração</h3>
            <p className="text-sm text-gray-600 mt-1">
              Conecte fontes de dados para melhorar rastreamento e atribuição.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Pixel */}
            <div className="card rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-gray-900 font-semibold">Pixel (Sessão + UTMs)</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Captura contexto de navegação e decora o link rastreado com <span className="font-mono">mc_sid</span>.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-50 text-green-700 text-xs font-medium px-2 py-1">
                  Ativo
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInstallMode("html")
                    setPixelModalOpen(true)
                  }}
                  className="px-3 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800"
                >
                  Instalar Pixel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Open the actual pixel in a new tab to verify availability
                    window.open(pixelJsUrl, "_blank", "noopener,noreferrer")
                  }}
                  className="px-3 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-800 hover:bg-gray-50"
                >
                  Ver pixel.js
                </button>
              </div>
            </div>

            {/* WhatsApp */}
            <div className="card rounded-xl border border-gray-200 p-5 opacity-80">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-gray-900 font-semibold">WhatsApp (QR Code)</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Conectar a sessão do WhatsApp e manter o worker online.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1">
                  Em breve
                </span>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  disabled
                  className="px-3 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-400 cursor-not-allowed"
                >
                  Configurar
                </button>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Dica: o Pixel não altera o modelo oficial de atribuição. Ele fortalece a coleta (Sessão → Clique → Conversa).
          </div>
        </div>
      ) : (
        <div className="card rounded-xl border border-gray-200 p-5">
          <p className="text-gray-700 font-medium">Em breve</p>
          <p className="text-sm text-gray-500 mt-1">
            Aqui você poderá ajustar dados do perfil e preferências.
          </p>
        </div>
      )}

      {/* Pixel Install Modal */}
      {pixelModalOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPixelModalOpen(false)}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl border border-gray-200">
              <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-200">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">Instalar Pixel</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Copie o snippet e siga as instruções (HTML direto ou Google Tag Manager).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPixelModalOpen(false)}
                  className="rounded-md p-2 hover:bg-gray-50 text-gray-600"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Mode selector */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInstallMode("html")}
                    className={classNames(
                      "px-3 py-2 text-sm font-medium rounded-md border",
                      installMode === "html"
                        ? "border-gray-900 text-gray-900"
                        : "border-gray-200 text-gray-600 hover:text-gray-900"
                    )}
                  >
                    HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => setInstallMode("gtm")}
                    className={classNames(
                      "px-3 py-2 text-sm font-medium rounded-md border",
                      installMode === "gtm"
                        ? "border-gray-900 text-gray-900"
                        : "border-gray-200 text-gray-600 hover:text-gray-900"
                    )}
                  >
                    Google Tag Manager
                  </button>
                </div>

                {/* Snippet */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">Snippet do Pixel</p>
                    <button
                      type="button"
                      onClick={() => copy(installSnippet, "snippet")}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800"
                    >
                      {copied === "snippet" ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <pre className="mt-3 text-xs overflow-auto whitespace-pre-wrap text-gray-800">
                    {installSnippet}
                  </pre>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900">Atenção: use o link rastreado</p>
                  <p className="text-sm text-amber-800 mt-1">
                    Para que a atribuição funcione, o botão de WhatsApp da sua página deve apontar para o link criado em
                    <span className="font-medium"> Links rastreados</span> (ex: <span className="font-mono">/track/&lt;slug&gt;</span>).
                  </p>
                  <p className="text-xs text-amber-700 mt-2">
                    Não use links diretos do WhatsApp (<span className="font-mono">wa.me</span> / <span className="font-mono">api.whatsapp.com</span>) no botão principal.
                  </p>
                </div>

                {/* Instructions */}
                {installMode === "html" ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900">Como instalar (HTML)</p>
                    <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
                      <li>Adicione o snippet do Pixel no <span className="font-mono">&lt;head&gt;</span> do seu site/landing page.</li>
                      <li>Garanta que o botão de WhatsApp use o link <span className="font-mono">/track/&lt;slug&gt;</span>.</li>
                      <li>O Pixel cria e persiste uma sessão (<span className="font-mono">mc_sid</span>) e decora o link automaticamente.</li>
                      <li>Teste abrindo o DevTools → Network e filtrando por <span className="font-mono">/api/track/session</span>.</li>
                    </ol>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900">Como instalar (GTM)</p>
                    <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
                      <li>No GTM, crie uma tag do tipo <span className="font-medium">Custom HTML</span>.</li>
                      <li>Cole o snippet do Pixel e marque para disparar em <span className="font-medium">All Pages</span>.</li>
                      <li>Publique o container e teste no Preview do GTM.</li>
                      <li>Garanta que o botão do WhatsApp use o link <span className="font-mono">/track/&lt;slug&gt;</span>.</li>
                    </ol>
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  Observação: o Pixel não envia UTMs para o WhatsApp. Ele captura o contexto no seu domínio e associa sessão → clique → conversa.
                </div>
              </div>

              <div className="p-5 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPixelModalOpen(false)}
                  className="px-3 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-800 hover:bg-gray-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}