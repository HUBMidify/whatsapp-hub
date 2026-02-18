import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic"

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3001";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const response = await fetch(
      `${WORKER_URL}/status/${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { connected: false },
        { status: 200 }
      );
    }

    const data = await response.json();

    return NextResponse.json(
      { connected: data.connected ?? false },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro API /api/whatsapp/status:", error);

    return NextResponse.json(
      { connected: false },
      { status: 200 }
    );
  }
}