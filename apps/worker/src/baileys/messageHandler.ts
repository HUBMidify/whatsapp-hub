import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function handleIncomingMessage(message: WAMessage, sock?: WASocket) {
  try {
    if (message.key.fromMe) {
      return;
    }

    if (message.key.remoteJid?.includes('@g.us')) {
      return;
    }

    const rawJid = message.key.remoteJid || '';
    
    const phone = rawJid
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '');
    
    const messageText = 
      message.message?.conversation || 
      message.message?.extendedTextMessage?.text || 
      '';

    if (!phone || !messageText) {
      console.log('⚠️  Mensagem ignorada (sem telefone ou texto)');
      return;
    }

    console.log(`📩 Mensagem de ${phone}: ${messageText.substring(0, 50)}...`);

    let contactName: string | null = null;
    
    if (sock) {
      try {
        const contactInfo = message.pushName || null;
        contactName = contactInfo;
        console.log(`👤 Nome do contato: ${contactName || 'Não disponível'}`);
      } catch (error) {
        console.log('⚠️  Não foi possível buscar nome do contato');
      }
    }

    let lead = await prisma.lead.findUnique({
      where: { phone }
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          phone,
          name: contactName,
          firstSeenAt: new Date(),
          lastSeenAt: new Date()
        }
      });
      console.log(`✅ Lead criado: ${phone}${contactName ? ` (${contactName})` : ''}`);
    } else {
      const updateData: Prisma.LeadUpdateInput = { lastSeenAt: new Date() };
      if (!lead.name && contactName) {
        updateData.name = contactName;
      }
      
      await prisma.lead.update({
        where: { id: lead.id },
        data: updateData
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
