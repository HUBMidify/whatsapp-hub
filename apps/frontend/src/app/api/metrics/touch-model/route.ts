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

type BucketItem = { originLabel: string; count: number; pct: number };

function toBuckets(map: Map<string, number>, total: number): BucketItem[] {
  return Array.from(map.entries())
    .map(([originLabel, count]) => ({
      originLabel,
      count,
      pct: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = parseRange(url);

  // Pega conversas do período com o mínimo necessário
  const conversations = await prisma.conversation.findMany({
    where: {
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      id: true,
      leadId: true,
      createdAt: true,
      originLabel: true,
      clickLogId: true,
    },
    orderBy: [{ leadId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  // Agrupa por leadId
  const byLead = new Map<string, typeof conversations>();

  for (const c of conversations) {
    const arr = byLead.get(c.leadId);
    if (arr) arr.push(c);
    else byLead.set(c.leadId, [c]);
  }

  const totalLeads = byLead.size;

  // Distributions
  const firstTouchMap = new Map<string, number>();
  const lastTouchMap = new Map<string, number>();

  for (const [, convsAsc] of byLead) {
    // convsAsc já está ascendente
    const first = convsAsc[0];
    const firstLabel = first.originLabel ?? "UNTRACKED";
    firstTouchMap.set(firstLabel, (firstTouchMap.get(firstLabel) ?? 0) + 1);

    // last tracked (de mídia) dentro do período:
    // regra: originLabel != UNTRACKED (ou clickLogId != null).
    // Vamos priorizar clickLogId != null (mais “fato”), mas aceitamos originLabel também.
    let lastTrackedLabel: string | null = null;

    for (let i = convsAsc.length - 1; i >= 0; i--) {
      const c = convsAsc[i];
      const label = c.originLabel ?? "UNTRACKED";

      const isTracked =
        c.clickLogId != null && label !== "UNTRACKED"; // conservador
      // Se você quiser ser menos conservador: const isTracked = c.clickLogId != null || label !== "UNTRACKED";

      if (isTracked) {
        lastTrackedLabel = label;
        break;
      }
    }

    const lastLabel = lastTrackedLabel ?? "UNTRACKED";
    lastTouchMap.set(lastLabel, (lastTouchMap.get(lastLabel) ?? 0) + 1);
  }

  const firstTouch = toBuckets(firstTouchMap, totalLeads);
  const lastTouch = toBuckets(lastTouchMap, totalLeads);

  return NextResponse.json({
    range,
    totalLeads,
    firstTouch,
    lastTouch,
  });
}