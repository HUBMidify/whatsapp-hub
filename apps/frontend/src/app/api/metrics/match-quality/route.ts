import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getRange(searchParams: URLSearchParams) {
  // default: últimos 7 dias
  const toParam = parseDateParam(searchParams.get("to"));
  const fromParam = parseDateParam(searchParams.get("from"));

  const to = toParam ?? new Date();
  const from = fromParam ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  // normaliza caso venha invertido
  if (from > to) return { from: to, to: from };
  return { from, to };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = getRange(searchParams);

  const whereBase = {
    createdAt: {
      gte: range.from,
      lte: range.to,
    },
  } as const;

  // Qualidade do match = quantas conversas ficam atribuídas (têm clickLog) e como está a confiança.
  // Obs: usamos `clickLog` (relation) para funcionar mesmo quando o prisma não expõe `clickLogId` diretamente.
  const [total, matched, rows, byMethod] = await Promise.all([
    prisma.conversation.count({ where: whereBase }),
    prisma.conversation.count({
      where: { ...whereBase, clickLog: { isNot: null } },
    }),
    prisma.conversation.findMany({
      where: whereBase,
      select: { matchConfidence: true },
    }),
    prisma.conversation.groupBy({
      by: ["matchMethod"],
      where: whereBase,
      _count: { _all: true },
      _avg: { matchConfidence: true },
      orderBy: { _count: { matchMethod: "desc" } },
    }),
  ]);

  const confidences = rows
    .map((r) => r.matchConfidence)
    .filter((v): v is number => typeof v === "number");

  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  return NextResponse.json({
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    total,
    matched,
    matchedRate: total > 0 ? matched / total : 0,
    confidence: {
      count: confidences.length,
      avg: avgConfidence,
      p50: percentile(confidences, 50),
      p95: percentile(confidences, 95),
    },
    byMethod: byMethod.map((m) => ({
      matchMethod: m.matchMethod ?? "UNKNOWN",
      count: m._count?._all ?? 0,
      avgConfidence: m._avg?.matchConfidence ?? null,
    })),
  });
}