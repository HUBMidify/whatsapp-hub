import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    // 1. Verifica sessão
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 2. Fetch para o Worker com timeout de 10s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(
      `http://localhost:3001/qrcode/${userId}`,
      {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    clearTimeout(timeout);

    // 3. Erro vindo do Worker
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

    // 4. Sucesso
    return NextResponse.json(
      { qrCode: data.qrCode },
      { status: 200 }
    );
  } catch (error: any) {
    // Timeout ou erro inesperado
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Timeout ao conectar com o worker" },
        { status: 504 }
      );
    }

    console.error("Erro API /api/whatsapp/qrcode:", error);

    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
