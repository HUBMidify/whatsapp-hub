import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3001";

type WorkerStatusResponse = {
  status?: string;
  connected?: boolean;
  whatsappNumber?: string | null;
  whatsappJid?: string | null;
};

function isDev() {
  return process.env.NODE_ENV !== "production";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Primary path: authenticated user
    let userId = session?.user?.id ?? null;

    // Dev fallback: allow x-user-id so you can curl/test without NextAuth cookies
    if (!userId && isDev()) {
      const headerUserId = req.headers.get("x-user-id");
      if (headerUserId && headerUserId.trim() !== "") {
        userId = headerUserId.trim();
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const response = await fetch(`${WORKER_URL}/status/${userId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // avoid any caching surprises
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { connected: false, status: "disconnected", whatsappNumber: null, whatsappJid: null },
        { status: 200 }
      );
    }

    const data = (await response.json()) as WorkerStatusResponse;

    return NextResponse.json(
      {
        connected: Boolean(data.connected),
        status: data.status ?? (data.connected ? "connected" : "disconnected"),
        whatsappNumber: data.whatsappNumber ?? null,
        whatsappJid: data.whatsappJid ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro API /api/whatsapp/status:", error);

    return NextResponse.json(
      { connected: false, status: "disconnected", whatsappNumber: null, whatsappJid: null },
      { status: 200 }
    );
  }
}