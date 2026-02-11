import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(
      `${WORKER_URL}/qrcode/${userId}`,
      {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: "Erro ao buscar QR Code no worker",
          details: text,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(
      { qrCode: data.qrCode },
      { status: 200 }
    );
}  catch (error: unknown) {
  // Timeout (abort)
  if (error instanceof Error && error.name === "AbortError") {
    return NextResponse.json(
      { error: "Timeout ao conectar com o worker" },
      { status: 504 }
    );
  }

  console.error("Erro API /api/whatsapp/qrcode:", error);

  const message = error instanceof Error ? error.message : "Erro interno do servidor";

  return NextResponse.json(
    { error: message },
    { status: 500 }
  );
}
}