import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed...');

  const passwordHash = await bcrypt.hash('senha123', 10);
  
  const user = await prisma.user.create({
    data: {
      email: 'teste@agencia.com',
      name: 'Agência Teste',
      password: passwordHash,
    },
  });

  console.log('✅ Usuário criado:', user.email);

  const leads = await Promise.all([
    prisma.lead.create({
      data: {
        phone: '+5511987654321',
        name: 'João Silva',
      },
    }),
    prisma.lead.create({
      data: {
        phone: '+5511976543210',
        name: 'Maria Santos',
      },
    }),
    prisma.lead.create({
      data: {
        phone: '+5511965432109',
        name: 'Pedro Oliveira',
      },
    }),
  ]);

  console.log('✅ Leads criados:', leads.length);

  const trackingLinks = await Promise.all([
    prisma.trackingLink.create({
      data: {
        userId: user.id,
        name: 'Promoção Verão',
        slug: 'promo-verao',
        redirectUrl: 'https://exemplo.com/verao',
        preFilledMessage: 'Olá! Vi a promoção de verão',
        utmSource: 'facebook',
        utmCampaign: 'verao2024',
      },
    }),
    prisma.trackingLink.create({
      data: {
        userId: user.id,
        name: 'Black Friday',
        slug: 'black-friday',
        redirectUrl: 'https://exemplo.com/blackfriday',
        preFilledMessage: 'Quero saber mais sobre a Black Friday',
        utmSource: 'instagram',
        utmCampaign: 'bf2024',
      },
    }),
  ]);

  console.log('✅ TrackingLinks criados:', trackingLinks.length);

  const clickLog = await prisma.clickLog.create({
    data: {
      trackingLinkId: trackingLinks[0].id,
      fbclid: 'IwAR123456789',
      fbc: 'fb.1.123456789.IwAR123456789',
      fbp: 'fb.1.123456789.987654321',
      utmSource: 'facebook',
      utmCampaign: 'verao2024',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    },
  });

  console.log('✅ ClickLog criado');

  await Promise.all([
    prisma.conversation.create({
      data: {
        leadId: leads[0].id,
        clickLogId: clickLog.id,
        messageText: 'Olá! Vi a promoção de verão',
        matchMethod: 'FBCLID',
        matchConfidence: 0.95,
        capiStatus: 'SENT',
        capiEventId: 'evt_123',
      },
    }),
    prisma.conversation.create({
      data: {
        leadId: leads[1].id,
        messageText: 'Oi, tudo bem?',
        matchMethod: 'ORGANIC',
        matchConfidence: 1.0,
      },
    }),
  ]);

  console.log('✅ Conversations criadas');
  console.log('🎉 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });