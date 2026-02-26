import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OriginLabel } from "@prisma/client";

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

  // 1) Conversas do período (mínimo necessário)
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

  // 2) Agrupa por leadId (somente leads “ativos” no período)
  const byLead = new Map<string, typeof conversations>();
  for (const c of conversations) {
    const arr = byLead.get(c.leadId);
    if (arr) arr.push(c);
    else byLead.set(c.leadId, [c]);
  }

  const leadIds = Array.from(byLead.keys());
  const totalLeads = leadIds.length;

  // 3) Busca estado persistido no Lead (first/last tracked)
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: {
      id: true,
      firstTrackedOriginLabel: true,
      lastTrackedOriginLabel: true,
    },
  });

  const leadState = new Map<
    string,
    {
      first: OriginLabel | null;
      last: OriginLabel | null;
    }
  >();

  for (const l of leads) {
    leadState.set(l.id, {
      first: l.firstTrackedOriginLabel,
      last: l.lastTrackedOriginLabel,
    });
  }

  // 4) Distribuições
  // First Tracked Touch: baseado no Lead (lifetime)
  // Last Touch (do período):
  //   - se houve tracked no período => usa o último tracked do período
  //   - senão, se Lead já foi tracked => DIRECT_RETURN
  //   - senão => NEVER_TRACKED
  const firstTrackedMap = new Map<string, number>();
  const lastTouchMap = new Map<string, number>();

  let directReturnCount = 0;
  let neverTrackedCount = 0;

  for (const [leadId, convsAsc] of byLead) {
    const state = leadState.get(leadId);
    const firstTracked = state?.first ?? null;

    // First tracked (lifetime)
    if (firstTracked) {
      const key = String(firstTracked);
      firstTrackedMap.set(key, (firstTrackedMap.get(key) ?? 0) + 1);
    } else {
      neverTrackedCount++;
      firstTrackedMap.set(
        "NEVER_TRACKED",
        (firstTrackedMap.get("NEVER_TRACKED") ?? 0) + 1
      );
    }

    // Last tracked dentro do período
    let lastTrackedInRange: string | null = null;

    for (let i = convsAsc.length - 1; i >= 0; i--) {
      const c = convsAsc[i];
      const label = c.originLabel ?? "UNTRACKED";

      const isTracked =
        c.clickLogId != null || (label !== "UNTRACKED" && label != null);

      if (isTracked) {
        lastTrackedInRange = label;
        break;
      }
    }

    if (lastTrackedInRange) {
      lastTouchMap.set(
        lastTrackedInRange,
        (lastTouchMap.get(lastTrackedInRange) ?? 0) + 1
      );
    } else if (firstTracked) {
      directReturnCount++;
      lastTouchMap.set(
        "DIRECT_RETURN",
        (lastTouchMap.get("DIRECT_RETURN") ?? 0) + 1
      );
    } else {
      // já contabilizado acima como neverTracked
      lastTouchMap.set(
        "NEVER_TRACKED",
        (lastTouchMap.get("NEVER_TRACKED") ?? 0) + 1
      );
    }
  }

  const firstTrackedTouch = toBuckets(firstTrackedMap, totalLeads);
  const lastTouch = toBuckets(lastTouchMap, totalLeads);

  const directReturn = {
    label: "DIRECT_RETURN",
    count: directReturnCount,
    pct: totalLeads > 0 ? directReturnCount / totalLeads : 0,
  };

  const neverTracked = {
    label: "NEVER_TRACKED",
    count: neverTrackedCount,
    pct: totalLeads > 0 ? neverTrackedCount / totalLeads : 0,
  };

  return NextResponse.json({
    range,
    totalLeads,
    directReturn,
    neverTracked,
    firstTrackedTouch,
    lastTouch,
  });
}