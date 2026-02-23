import { PrismaClient } from "@prisma/client";
import { runAttributionMatch } from "../src/attribution/attributionEngine";

const prisma = new PrismaClient();


const WHATSAPP_NUMBER = "5511999999999"; // número vinculado à sessão ativa
const TEXT = "Olá, quero comprar";

// Helper para resolver um userId válido
async function resolveUserId() {
  const envId = process.env.TEST_USER_ID || process.env.USER_ID;
  if (envId && envId.trim() !== "") return envId.trim();

  const u = await prisma.user.findFirst({ select: { id: true } });
  if (u?.id) return u.id;

  throw new Error(
    "Nenhum User encontrado no banco para criar TrackingLink. Defina TEST_USER_ID no .env (ou exporte TEST_USER_ID=... antes de rodar)."
  );
}

function randPhone() {
  const n = Math.floor(10000000 + Math.random() * 90000000);
  return "5511" + String(n);
}

async function main() {
  const now = new Date();
  const LEAD_PHONE = randPhone();

  console.log("🚀 Iniciando teste E2E");
  console.log("Lead:", LEAD_PHONE);
  
  const userId = await resolveUserId();
  console.log("User:", userId);

  // 1️⃣ Criar TrackingLink
  const slug = "t1_" + Date.now().toString(36);

  const trackingLink = await prisma.trackingLink.create({
    data: {
      userId,
      name: "TL Test Level1",
      slug,
      destinationUrl: "https://example.com",
      whatsappNumber: WHATSAPP_NUMBER,
      preFilledMessage: TEXT,
      platform: "google",
    },
  });

  // 2️⃣ Criar ClickLog dentro da janela
  const click = await prisma.clickLog.create({
    data: {
      shortId: "L1" + Math.random().toString(36).slice(2, 8),
      gclid: "TEST_GCLID_L1",
      trackingLinkId: trackingLink.id,
      createdAt: new Date(now.getTime() - 3 * 60 * 1000),
    },
  });

  console.log("✅ TrackingLink:", trackingLink.id);
  console.log("✅ ClickLog:", click.id);

  // 3️⃣ Rodar engine
  const result = await runAttributionMatch({
    prisma,
    whatsappNumber: WHATSAPP_NUMBER,
    messageText: TEXT,
    messageDate: now,
  });

  console.log("🧠 MatchResult:", result);

  // 4️⃣ Criar conversation usando relation
  const conversation = await prisma.conversation.create({
    data: {
      lead: {
        connectOrCreate: {
          where: { phone: LEAD_PHONE },
          create: { phone: LEAD_PHONE },
        },
      },
      messageText: result.cleanedMessageText ?? TEXT,
      createdAt: now,
      clickLog: result.clickLogId
        ? { connect: { id: result.clickLogId } }
        : undefined,
      matchMethod: result.matchMethod,
      matchConfidence: result.matchConfidence,
      originLabel: result.originLabel,
      originReason: result.originReason,
      clickToMessageLatencySeconds:
        result.clickToMessageLatencySeconds,
    },
  });

  console.log("💬 Conversation criada:", conversation.id);

  console.log("🎉 Teste concluído com sucesso!");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});