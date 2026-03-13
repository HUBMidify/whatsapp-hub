export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";

const MAX_CONTENT_LENGTH_BYTES = 8 * 1024; // 8 KB
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60;

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  return null;
}

function corsHeaders(origin?: string | null) {
  const safeOrigin = origin?.trim() || "*";

  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function getRateLimitKey(request: Request, ip: string | null) {
  const origin = request.headers.get("origin")?.trim() || "no-origin";
  const ua = request.headers.get("user-agent")?.slice(0, 120) || "no-ua";
  return `${ip || "no-ip"}::${origin}::${ua}`;
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return false;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

type SessionPayload = {
  sessionId: string;
  gclid?: string | null;
  fbclid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  userAgent?: string | null;
  ip?: string | null;
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_content_type" }), {
      status: 415,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  }

  const contentLengthRaw = request.headers.get("content-length");
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH_BYTES) {
    return new Response(JSON.stringify({ ok: false, error: "payload_too_large" }), {
      status: 413,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  }

  try {
    let body: Partial<SessionPayload>;
    try {
      body = (await request.json()) as Partial<SessionPayload>;
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      });
    }

    const sessionId = (body.sessionId ?? "").trim();
    const sessionIdPattern = /^[a-zA-Z0-9_-]{8,128}$/;
    if (!sessionId || !sessionIdPattern.test(sessionId)) {
      return new Response(
        JSON.stringify({ ok: false, error: "sessionId inválido" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        }
      );
    }

    const ip = (body.ip ?? getClientIp(request)) ?? null;
    const rateLimitKey = getRateLimitKey(request, ip);
    if (isRateLimited(rateLimitKey)) {
      return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      });
    }
    const userAgent =
      (body.userAgent ?? request.headers.get("user-agent")) ?? null;

    // Normaliza strings vazias -> null
    const clean = (v?: string | null) => {
      const t = (v ?? "").trim();
      return t ? t : null;
    };

    const limit = (v: string | null, max: number) => {
      if (!v) return null;
      return v.length > max ? v.slice(0, max) : v;
    };

    const incoming = {
      gclid: limit(clean(body.gclid), 255),
      fbclid: limit(clean(body.fbclid), 255),
      utmSource: limit(clean(body.utmSource), 255),
      utmMedium: limit(clean(body.utmMedium), 255),
      utmCampaign: limit(clean(body.utmCampaign), 255),
      utmContent: limit(clean(body.utmContent), 255),
      utmTerm: limit(clean(body.utmTerm), 255),
      userAgent: limit(clean(userAgent), 512),
      ip: limit(clean(ip), 128),
    };

    const existing = await prisma.clickSession.findUnique({
      where: { sessionId },
    });

    if (!existing) {
      await prisma.clickSession.create({
        data: {
          sessionId,
          ...incoming,
        },
      });
    } else {
      // Só preenche o que está vazio (não sobrescreve “first captured”)
      const dataToUpdate: Record<string, string | null | undefined> = {};

      for (const [k, v] of Object.entries(incoming)) {
        const current = (existing as any)[k] as string | null | undefined;
        if ((current === null || current === undefined) && v) {
          dataToUpdate[k] = v;
        }
      }

      // Mesmo que nada novo venha, o lastSeenAt já vai atualizar via @updatedAt
      await prisma.clickSession.update({
        where: { sessionId },
        data: dataToUpdate,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    console.error("❌ /api/track/session error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      }
    );
  }
}