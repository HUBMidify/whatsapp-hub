import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseRange(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  return { from: fromDate, to: toDate };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = parseRange(url);

  const whereRange = {
    createdAt: {
      gte: range.from,
      lte: range.to,
    },
  };

  // 1) Distribuição por origem (para gráfico) — consolidando null + UNTRACKED
  const grouped = await prisma.conversation.groupBy({
    by: ["originLabel"],
    where: whereRange,
    _count: { _all: true },
  });

  const total = grouped.reduce((acc, g) => acc + g._count._all, 0);

  const byLabel = new Map<string, number>();
  for (const g of grouped) {
    const label = g.originLabel ?? "UNTRACKED";
    byLabel.set(label, (byLabel.get(label) ?? 0) + g._count._all);
  }

  const items = Array.from(byLabel.entries())
    .map(([originLabel, count]) => ({
      originLabel,
      count,
      pct: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const untracked = items.find((i) => i.originLabel === "UNTRACKED") ?? {
    originLabel: "UNTRACKED",
    count: 0,
    pct: 0,
  };

  const tracked = Math.max(0, total - untracked.count);
  const trackedRate = total > 0 ? tracked / total : 0;

  // 2) Separar UNTRACKED em:
  //    - directReturn: lead já teve pelo menos 1 conversa rastreada (em qualquer momento)
  //    - neverTracked: lead nunca teve conversa rastreada
  // Obs: Para MVP, a regra "já teve rastreada" considera o histórico inteiro.
  const trackedLeadRows = await prisma.conversation.findMany({
    where: {
      // originLabel preenchido e diferente de UNTRACKED
      originLabel: { not: "UNTRACKED" },
      NOT: [{ originLabel: null }],
    },
    select: { leadId: true },
    distinct: ["leadId"],
  });

  const trackedLeadIds = trackedLeadRows.map((r) => r.leadId);

  const directReturn = await prisma.conversation.count({
    where: {
      ...whereRange,
      OR: [{ originLabel: null }, { originLabel: "UNTRACKED" }],
      ...(trackedLeadIds.length > 0 ? { leadId: { in: trackedLeadIds } } : {}),
    },
  });

  const neverTracked = Math.max(0, untracked.count - directReturn);

  const directReturnRate = total > 0 ? directReturn / total : 0;
  const neverTrackedRate = total > 0 ? neverTracked / total : 0;

  // 3) "Winner" apenas entre rastreados (para card pequeno)
  const trackedItems = items.filter((i) => i.originLabel !== "UNTRACKED");
  const winner = trackedItems[0] ?? null;

  return NextResponse.json({
    range,
    total,
    tracked,
    untracked: {
      originLabel: untracked.originLabel,
      pct: untracked.pct,
      count: untracked.count,
    },
    trackedRate,
    // UNTRACKED breakdown (MVP)
    directReturn: {
      label: "DIRECT_RETURN",
      count: directReturn,
      pct: directReturnRate,
    },
    neverTracked: {
      label: "NEVER_TRACKED",
      count: neverTracked,
      pct: neverTrackedRate,
    },
    // Headline winner (somente rastreado)
    winner: winner
      ? {
          originLabel: winner.originLabel,
          pct: winner.pct,
          count: winner.count,
        }
      : null,
    // Detalhe completo (para gráfico futuro)
    items,
  });
}