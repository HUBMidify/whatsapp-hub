import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { PrismaClient } from '@prisma/client';

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
    
    // Extrair telefone limpo (remover @s.whatsapp.net e @lid)
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

    // Tentar buscar nome do contato via WhatsApp
    let contactName: string | null = null;
    
    if (sock) {
      try {
        const contact = await sock.onWhatsApp(rawJid);
        if (contact && contact[0]) {
          // Buscar informações completas do contato
          const contactInfo = message.pushName || null;
          contactName = contactInfo;
          console.log(`👤 Nome do contato: ${contactName || 'Não disponível'}`);
        }
      } catch (error) {
        console.log('⚠️  Não foi possível buscar nome do contato');
      }
    }

    // Buscar ou criar Lead
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
      // Atualizar nome se veio vazio antes
      const updateData: any = { lastSeenAt: new Date() };
      if (!lead.name && contactName) {
        updateData.name = contactName;
      }
      
      await prisma.lead.update({
        where: { id: lead.id },
        data: updateData
      });
    }

    // Criar Conversation
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
