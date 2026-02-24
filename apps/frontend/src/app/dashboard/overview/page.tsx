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

function fmtSecondsToMin(s: number | null) {
  if (s == null) return "—";
  const m = Math.round((s / 60) * 10) / 10;
  return `${m} min`;
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

        <MetricCard title="Tracking Quality" value="Em breve" />
        <MetricCard title="Origin Mix" value="Em breve" />
        <MetricCard title="Match Quality" value="Em breve" />
      </div>
    </div>
  );
}