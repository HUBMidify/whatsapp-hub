export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OriginLabel } from "@prisma/client";

type Range = { from: string; to: string };

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIso(d: Date): string {
  return d.toISOString();
}

function computeRange(fromParam: Date | null, toParam: Date | null): { from: Date; to: Date } {
  const now = new Date();
  const defaultTo = now;
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let to = toParam ?? defaultTo;
  let from = fromParam ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (!fromParam && toParam) {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (fromParam && !toParam) {
    to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  if (from.getTime() === to.getTime()) {
    to = new Date(to.getTime() + 1);
  }

  const maxWindowMs = 180 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxWindowMs) {
    from = new Date(to.getTime() - maxWindowMs);
  }

  return { from, to };
}

type LatencyRow = {
  originLabel: OriginLabel | null;
  count: bigint;
  avg: number | null;
  p50: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const fromParam = parseDateParam(url.searchParams.get("from"));
    const toParam = parseDateParam(url.searchParams.get("to"));

    if (url.searchParams.get("from") && !fromParam) {
      return NextResponse.json(
        { error: "Parâmetro 'from' inválido. Use ISO date/datetime." },
        { status: 400 }
      );
    }

    if (url.searchParams.get("to") && !toParam) {
      return NextResponse.json(
        { error: "Parâmetro 'to' inválido. Use ISO date/datetime." },
        { status: 400 }
      );
    }

    const { from, to } = computeRange(fromParam, toParam);
    const range: Range = { from: toIso(from), to: toIso(to) };

    // Apenas conversas rastreadas com latência persistida
    // (originLabel != UNTRACKED) AND clickToMessageLatencySeconds IS NOT NULL
    //
    // Tabela no banco normalmente é "Conversation" (Prisma mapeia assim no Postgres).
    // Se você tiver @@map, ajuste o nome na query.
    const rows = await prisma.$queryRaw<LatencyRow[]>`
      SELECT
        "originLabel" AS "originLabel",
        COUNT(*) AS "count",
        AVG("clickToMessageLatencySeconds")::float8 AS "avg",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "clickToMessageLatencySeconds")::float8 AS "p50",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "clickToMessageLatencySeconds")::float8 AS "p95",
        MIN("clickToMessageLatencySeconds")::float8 AS "min",
        MAX("clickToMessageLatencySeconds")::float8 AS "max"
      FROM "Conversation"
      WHERE
        "createdAt" >= ${from}
        AND "createdAt" < ${to}
        AND "clickToMessageLatencySeconds" IS NOT NULL
        AND "originLabel" IS NOT NULL
        AND "originLabel" <> ${OriginLabel.UNTRACKED}::"OriginLabel"
      GROUP BY "originLabel"
      ORDER BY "originLabel" ASC
    `;

    const overall = await prisma.$queryRaw<
      { count: bigint; avg: number | null; p50: number | null; p95: number | null; min: number | null; max: number | null }[]
    >`
      SELECT
        COUNT(*) AS "count",
        AVG("clickToMessageLatencySeconds")::float8 AS "avg",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "clickToMessageLatencySeconds")::float8 AS "p50",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "clickToMessageLatencySeconds")::float8 AS "p95",
        MIN("clickToMessageLatencySeconds")::float8 AS "min",
        MAX("clickToMessageLatencySeconds")::float8 AS "max"
      FROM "Conversation"
      WHERE
        "createdAt" >= ${from}
        AND "createdAt" < ${to}
        AND "clickToMessageLatencySeconds" IS NOT NULL
        AND "originLabel" IS NOT NULL
        AND "originLabel" <> ${OriginLabel.UNTRACKED}::"OriginLabel"
      LIMIT 1
    `;

    const o = overall[0] ?? { count: BigInt(0), avg: null, p50: null, p95: null, min: null, max: null };

    // JSON não serializa bigint
    const overallPayload = {
      count: Number(o.count ?? BigInt(0)),
      avgSeconds: o.avg,
      p50Seconds: o.p50,
      p95Seconds: o.p95,
      minSeconds: o.min,
      maxSeconds: o.max,
    };

    const byOrigin = rows.map((r) => ({
      originLabel: r.originLabel,
      count: Number(r.count),
      avgSeconds: r.avg,
      p50Seconds: r.p50,
      p95Seconds: r.p95,
      minSeconds: r.min,
      maxSeconds: r.max,
    }));

    return NextResponse.json({
      range,
      overall: overallPayload,
      byOrigin,
    });
  } catch (err) {
    console.error("[metrics/latency]", err);
    return NextResponse.json({ error: "Erro ao calcular latência." }, { status: 500 });
  }
}