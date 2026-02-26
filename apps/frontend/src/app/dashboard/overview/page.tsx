"use client";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMetrics } from "@/lib/useMetrics";

type LatencyResp = {
  range: { from: string; to: string };
  overall: {
    count: number;
    avgSeconds: number | null;
    p50Seconds: number | null;
    p95Seconds: number | null;
  };
  byOrigin: Array<{
    originLabel: string | null;
    count: number;
    p50Seconds: number | null;
    p95Seconds: number | null;
  }>;
};

type OriginMixResp = {
  range: { from: string; to: string };
  total: number;
  winner: { originLabel: string; pct: number; count: number } | null;
  untracked: { originLabel: string; pct: number; count: number };
  items: Array<{ originLabel: string; count: number; pct: number }>;
};

type MatchQualityResp = {
  range?: { from: string; to: string };
  total?: number;
  matched?: number;
  matchedRate?: number;
  confidence?: {
    count: number;
    avg: number | null;
    p50: number | null;
    p95: number | null;
  };
  byMethod?: Array<{
    matchMethod: string | null;
    count: number;
    avgConfidence: number | null;
  }>;
};

type TouchModelResp = {
  range: { from: string; to: string };
  totalLeads: number;
  directReturn: { label: string; count: number; pct: number };
  neverTracked: { label: string; count: number; pct: number };
  firstTrackedTouch: Array<{ originLabel: string; count: number; pct: number }>;
  lastTouch: Array<{ originLabel: string; count: number; pct: number }>;
};

function humanOriginLabel(label: string) {
  switch (label) {
    case "GOOGLE_ADS":
      return "Google Ads";
    case "META_ADS":
      return "Meta Ads";
    case "SOCIAL":
      return "Social";
    case "OTHER":
      return "Outros";
    case "UNTRACKED":
      return "Não rastreado";
    case "NEVER_TRACKED":
      return "Nunca rastreado";
    default:
      return label.replaceAll("_", " ");
  }
}

function fmtSecondsToMin(s: number | null) {
  if (s == null) return "—";
  const m = Math.round((s / 60) * 10) / 10;
  return `${m} min`;
}

function fmtPct(p: number | null | undefined) {
  if (p == null) return "—";
  return `${Math.round(p * 100)}%`;
}

function MetricCard(props: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{props.title}</div>
      <div className="mt-2 text-2xl font-semibold">{props.value}</div>
      {props.sub ? (
        <div className="mt-2 text-sm text-muted-foreground">{props.sub}</div>
      ) : null}
    </Card>
  );
}

export default function OverviewPage() {
  const { data, isLoading, error } = useMetrics<LatencyResp>(
    "/api/metrics/latency"
  );

  const p50 = data?.overall.p50Seconds ?? null;
  const p95 = data?.overall.p95Seconds ?? null;
  const count = data?.overall.count ?? 0;
  
  const originMix = useMetrics<OriginMixResp>("/api/metrics/origin-mix");

  const {
    data: trackingData,
    isLoading: trackingLoading,
    error: trackingError,
  } = useMetrics<{
    total: number;
    tracked: number;
    untracked: number;
    trackedRate: number;
  }>("/api/metrics/tracking-quality");

  const matchQuality = useMetrics<MatchQualityResp>("/api/metrics/match-quality");
  const touchModel = useMetrics<TouchModelResp>("/api/metrics/touch-model");
  
  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description="Métricas e gráficos sobre captação e conversões."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Latência (P50)"
          value={isLoading ? "…" : fmtSecondsToMin(p50)}
          sub={
            error ? (
              "Erro ao carregar"
            ) : isLoading ? null : (
              <>
                P95: {fmtSecondsToMin(p95)} • Amostra: {count}
              </>
            )
          }
        />
        
        <MetricCard
          title="Tracking Quality"
          value={
            trackingLoading
              ? "…"
              : trackingError
              ? "Erro"
              : `${Math.round((trackingData?.trackedRate ?? 0) * 100)}%`
          }
          sub={
            trackingLoading || trackingError
              ? null
              : `Rastreadas: ${trackingData?.tracked ?? 0} / ${trackingData?.total ?? 0}`
          }
        />
        
        <MetricCard
  title="Origin Mix"
  value={
    originMix.isLoading
      ? "…"
      : originMix.error
      ? "Erro"
      : (() => {
          const winner = originMix.data?.winner;
          if (!winner) return "—";
          const pct = Math.round((winner.pct ?? 0) * 100);
          return `${humanOriginLabel(winner.originLabel)} • ${pct}%`;
        })()
  }
  sub={
    originMix.isLoading || originMix.error
      ? null
      : (() => {
          const untrackedPct = Math.round(
            (originMix.data?.untracked?.pct ?? 0) * 100
          );
          const total = originMix.data?.total ?? 0;
          return `Não rastreadas: ${untrackedPct}% • Total: ${total}`;
        })()
  }
/>
      <MetricCard
  title="Match Quality"
  value={
    matchQuality.isLoading
      ? "…"
      : matchQuality.error
      ? "Erro"
      : (() => {
          const rate = matchQuality.data?.matchedRate;
          if (rate == null) return "—";
          return `${Math.round(rate * 100)}%`;
        })()
  }
  sub={
    matchQuality.isLoading || matchQuality.error
      ? null
      : (() => {
          const total = matchQuality.data?.total ?? 0;
          const matched = matchQuality.data?.matched ?? 0;

          const top = (matchQuality.data?.byMethod ?? [])
            .slice()
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];

          const topLabel = top?.matchMethod
            ? top.matchMethod.replaceAll("_", " ")
            : null;

          const parts: string[] = [];
          parts.push(`Atribuídas: ${matched} / ${total}`);
          if (topLabel) parts.push(`Top: ${topLabel}`);
          return parts.join(" • ");
        })()
  }
/>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Touch Model</div>
            <div className="mt-1 text-lg font-semibold">Distribuição por jornada</div>
          </div>
          <div>
            {touchModel.isLoading ? (
              <div className="text-sm text-muted-foreground">Carregando…</div>
            ) : touchModel.error ? (
              <div className="text-sm text-muted-foreground">Erro ao carregar</div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">
                <span className="font-medium tabular-nums">
                  Leads: {touchModel.data?.totalLeads ?? 0}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="font-medium">Nunca rastreado:</span>
                <span className="tabular-nums">
                  {touchModel.data?.neverTracked?.count ?? 0} • {fmtPct(touchModel.data?.neverTracked?.pct)}
                </span>
              </div>
            )}
          </div>
        </div>

        {touchModel.isLoading ? (
          <div className="mt-4 text-sm text-muted-foreground">Carregando touch model…</div>
        ) : touchModel.error ? (
          <div className="mt-4 text-sm text-muted-foreground">Não foi possível carregar o touch model.</div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Retorno direto</div>
              <div className="mt-1 text-2xl font-semibold">
                {fmtPct(touchModel.data?.directReturn?.pct)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {touchModel.data?.directReturn?.count ?? 0} lead(s)
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Nunca rastreados</div>
              <div className="mt-1 text-2xl font-semibold">
                {fmtPct(touchModel.data?.neverTracked?.pct)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {touchModel.data?.neverTracked?.count ?? 0} lead(s)
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Primeiro touch rastreado</div>
              <div className="mt-2 space-y-2">
                {(touchModel.data?.firstTrackedTouch ?? [])
                  .filter((row) => row.originLabel !== "NEVER_TRACKED")
                  .slice()
                  .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
                  .slice(0, 5)
                  .map((row) => (
                    <div
                      key={`ft-${row.originLabel}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="truncate">
                        {humanOriginLabel(row.originLabel)}
                      </div>
                      <div className="tabular-nums text-muted-foreground">
                        {fmtPct(row.pct)} • {row.count}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Último touch (Last Touch)</div>

              {(() => {
                const rows = touchModel.data?.lastTouch ?? [];
                const list = rows
                  .filter((r) => r.originLabel !== "NEVER_TRACKED")
                  .slice()
                  .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
                  .slice(0, 5);

                return (
                  <div className="mt-3 space-y-2">
                    {list.map((row) => {
                      const firstMatch = (touchModel.data?.firstTrackedTouch ?? []).find(
                        (f) => f.originLabel === row.originLabel
                      );

                      const isRemarketing =
                        firstMatch && row.count > (firstMatch.count ?? 0);

                      return (
                        <div
                          key={`lt-${row.originLabel}`}
                          className={`flex items-center justify-between text-sm ${
                            isRemarketing ? "font-semibold" : ""
                          }`}
                        >
                          <div className="truncate">
                            {humanOriginLabel(row.originLabel)}
                            {isRemarketing && (
                              <span className="ml-2 text-xs text-emerald-600">
                                ↑ remarketing
                              </span>
                            )}
                          </div>
                          <div className="tabular-nums text-muted-foreground">
                            {fmtPct(row.pct)} • {row.count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-muted-foreground">
          * Retorno direto = lead já conhecido que voltou sem rastreamento. Nunca rastreados = lead sem nenhum touch rastreado na janela.
        </div>
      </Card>
    </div>
  );
}