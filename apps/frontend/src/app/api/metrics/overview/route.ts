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

  // If only `to` was provided, keep a 7-day window ending at `to`.
  if (!fromParam && toParam) {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  // If only `from` was provided, keep a 7-day window starting at `from`.
  if (fromParam && !toParam) {
    to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  // Safety: swap if inverted.
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  // Safety: if equal, make it a 1ms window.
  if (from.getTime() === to.getTime()) {
    to = new Date(to.getTime() + 1);
  }

  // Clamp very old ranges to avoid accidental full-table scans.
  // (We can relax later; for now this protects prod.)
  const maxWindowMs = 180 * 24 * 60 * 60 * 1000; // 180 days
  if (to.getTime() - from.getTime() > maxWindowMs) {
    from = new Date(to.getTime() - maxWindowMs);
  }

  return { from, to };
}

export const dynamic = "force-dynamic";
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

    // Basic totals
    const [leadsTotal, conversationsTotal, trackedConversationsTotal, byOriginRaw] =
      await Promise.all([
        prisma.lead.count({
          where: {
            firstSeenAt: {
              gte: from,
              lt: to,
            },
          },
        }),
        prisma.conversation.count({
          where: {
            createdAt: {
              gte: from,
              lt: to,
            },
          },
        }),
        prisma.conversation.count({
          where: {
            createdAt: {
              gte: from,
              lt: to,
            },
            originLabel: {
              not: OriginLabel.UNTRACKED,
            },
          },
        }),
        prisma.conversation.groupBy({
          by: ["originLabel"],
          where: {
            createdAt: {
              gte: from,
              lt: to,
            },
            originLabel: {
              not: null,
            },
          },
          _count: {
            _all: true,
          },
        }),
      ]);

    const trackingQualityPct =
      conversationsTotal > 0
        ? Math.round((trackedConversationsTotal / conversationsTotal) * 10000) / 100
        : 0;

    // Normalize byOriginLabel into a stable object including all 5 labels.
    const byOriginLabel: Record<OriginLabel, number> = {
      META_ADS: 0,
      GOOGLE_ADS: 0,
      SOCIAL: 0,
      OTHER: 0,
      UNTRACKED: 0,
    };

    for (const row of byOriginRaw) {
      const label = row.originLabel;
      if (!label) continue;

      if (label in byOriginLabel) {
        byOriginLabel[label as OriginLabel] = row._count._all;
      }
    }

    const range: Range = { from: toIso(from), to: toIso(to) };

    return NextResponse.json({
      range,
      leadsTotal,
      conversationsTotal,
      trackedConversationsTotal,
      trackingQualityPct,
      byOriginLabel,
    });
  } catch (err) {
    console.error("[metrics/overview]", err);
    return NextResponse.json(
      { error: "Erro ao calcular métricas." },
      { status: 500 }
    );
  }
}