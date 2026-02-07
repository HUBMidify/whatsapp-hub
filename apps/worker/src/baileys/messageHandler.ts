import { WAMessage } from '@whiskeysockets/baileys';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handleIncomingMessage(message: WAMessage) {
  try {
    if (message.key.fromMe) {
      return;
    }

    if (message.key.remoteJid?.includes('@g.us')) {
      return;
    }

    const phone = message.key.remoteJid?.replace('@s.whatsapp.net', '') || '';
    const messageText = 
      message.message?.conversation || 
      message.message?.extendedTextMessage?.text || 
      '';

    if (!phone || !messageText) {
      console.log('⚠️  Mensagem ignorada (sem telefone ou texto)');
      return;
    }

    console.log(`📩 Mensagem de ${phone}: ${messageText.substring(0, 50)}...`);

    let lead = await prisma.lead.findUnique({
      where: { phone }
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          phone,
          firstSeenAt: new Date(),
          lastSeenAt: new Date()
        }
      });
      console.log(`✅ Lead criado: ${phone}`);
    } else {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { lastSeenAt: new Date() }
      });
    }

    const conversation = await prisma.conversation.create({
      data: {
        leadId: lead.id,
        messageText,
        matchMethod: 'ORGANIC',
        matchConfidence: 0
      }
    });

    console.log(`✅ Conversa salva: ID ${conversation.id}`);

  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
  }
}
