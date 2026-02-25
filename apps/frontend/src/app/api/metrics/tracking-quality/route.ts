import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseRange(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // sanity: se inválido, cai no default 7d
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    const safeTo = new Date();
    const safeFrom = new Date(safeTo.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: safeFrom, to: safeTo };
  }

  return { from: fromDate, to: toDate };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = parseRange(url);

  const whereBase = {
    createdAt: { gte: range.from, lte: range.to },
  };

  const [total, tracked] = await Promise.all([
    prisma.conversation.count({ where: whereBase }),
    prisma.conversation.count({
      where: { ...whereBase, clickLogId: { not: null } },
    }),
  ]);

  const untracked = total - tracked;
  const trackedRate = total > 0 ? tracked / total : 0;

  return NextResponse.json({
    range,
    total,
    tracked,
    untracked,
    trackedRate, // 0..1
  });
}