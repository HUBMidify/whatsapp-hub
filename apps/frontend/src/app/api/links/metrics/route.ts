import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function getUserId(req: Request) {
  return req.headers.get("x-user-id")
}

type ClickForChannel = {
  trackingLinkId: string | null
  fbclid: string | null
  gclid: string | null
  utmSource: string | null
}

type ChannelKey = "meta" | "google" | "social" | "other" | "untracked"

function classifyChannel(click: ClickForChannel): ChannelKey {
  if (click.fbclid) return "meta"
  if (click.gclid) return "google"

  const source = click.utmSource?.toLowerCase().trim()

  if (!source) return "untracked"

  if (["facebook", "instagram", "meta"].some((s) => source.includes(s))) {
    return "meta"
  }

  if (["google", "youtube"].some((s) => source.includes(s))) {
    return "google"
  }

  if (
    ["linkedin", "twitter", "tiktok", "pinterest"].some((s) =>
      source.includes(s)
    )
  ) {
    return "social"
  }

  return "other"
}

function emptyChannels() {
  return {
    meta: 0,
    google: 0,
    social: 0,
    other: 0,
    untracked: 0,
  }
}

export async function GET(req: Request) {
  const userId = getUserId(req)

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const links = await prisma.trackingLink.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    })

    if (links.length === 0) {
      return NextResponse.json({
        overview: {
          totalClicks: 0,
          channels: emptyChannels(),
        },
        byLink: [],
      })
    }

    const linkIds = links.map((l) => l.id)

    const clicks = await prisma.clickLog.findMany({
      where: {
        trackingLinkId: { in: linkIds },
      },
      select: {
        trackingLinkId: true,
        fbclid: true,
        gclid: true,
        utmSource: true,
      },
    })

    const overviewChannels = emptyChannels()

    const byLinkMap: Record<
      string,
      {
        id: string
        name: string
        slug: string
        totalClicks: number
        channels: ReturnType<typeof emptyChannels>
      }
    > = {}

    links.forEach((link) => {
      byLinkMap[link.id] = {
        id: link.id,
        name: link.name,
        slug: link.slug,
        totalClicks: 0,
        channels: emptyChannels(),
      }
    })

    clicks.forEach((click) => {
      if (!click.trackingLinkId) return

      const channel = classifyChannel(click)

      overviewChannels[channel]++

      const linkEntry = byLinkMap[click.trackingLinkId]
      if (linkEntry) {
        linkEntry.totalClicks++
        linkEntry.channels[channel]++
      }
    })

    return NextResponse.json({
      overview: {
        totalClicks: clicks.length,
        channels: overviewChannels,
      },
      byLink: Object.values(byLinkMap),
    })
  } catch (err) {
    console.error("[GET /api/links/metrics] error:", err)
    return NextResponse.json(
      { error: "Erro ao carregar métricas" },
      { status: 500 }
    )
  }
}