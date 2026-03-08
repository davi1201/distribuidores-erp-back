import { Injectable } from '@nestjs/common';
import { createLogger } from '../core/logging';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../prisma/prisma.service';
import { XMLParser } from 'fast-xml-parser';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MailWatcherService {
  private readonly logger = createLogger(MailWatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_3_HOURS)
  async checkEmails() {
    this.logger.log('📥 Verificando e-mails configurados pelos clientes...');

    const configs = await (this.prisma as any).tenantEmailConfig.findMany({
      where: { isActive: true },
      include: { tenant: true },
    });

    if (!configs?.length) {
      this.logger.debug('Nenhuma configuração de e-mail ativa encontrada.');
      return;
    }

    for (const config of configs) {
      await this.processTenantMailbox(config);
    }
  }

  private async processTenantMailbox(config: any) {
    const imapConfig = {
      imap: {
        user: config.user,
        password: config.password,
        host: config.host,
        port: config.port,
        tls: true,
        authTimeout: 5000,
      },
    };

    try {
      this.logger.debug(`Conectando em ${config.host} (${config.user})...`);
      const connection = await imap.connect(imapConfig);

      await connection.openBox('INBOX');

      // Busca SOMENTE não lidos
      const fetchOptions = {
        // CORREÇÃO: Adicionado '' para baixar o corpo completo com anexos
        bodies: ['HEADER', 'TEXT', ''],
        struct: true,
        markSeen: false, // não marcar ainda
      };

      const messages = await connection.search(['UNSEEN'], fetchOptions);

      this.logger.log(
        `[${config.tenant.name}] ${messages.length} mensagens novas encontradas.`,
      );

      for (const item of messages) {
        // Agora 'parts' conterá a parte com which === '' (o raw message)
        const all = item.parts.find((p) => p.which === '');
        const id = item.attributes.uid;
        const idHeader = 'Imap-Id: ' + id + '\r\n';

        // Se 'all' vier undefined, usamos o header, mas sem anexos não funcionará
        const raw = all?.body || '';

        if (!raw) {
          this.logger.warn(`Não foi possível baixar o corpo do email ${id}.`);
          continue;
        }

        const mail = await simpleParser(idHeader + raw);

        this.logger.debug(
          `Processando e-mail: "${mail.subject}" de ${mail.from?.text}`,
        );

        if (mail.attachments?.length) {
          this.logger.debug(`> ${mail.attachments.length} anexos encontrados`);
          for (const attachment of mail.attachments) {
            this.logger.debug(
              `>> ${attachment.filename} (${attachment.contentType})`,
            );

            const isXml =
              attachment.filename?.toLowerCase().endsWith('.xml') ||
              attachment.contentType.includes('xml');

            if (isXml) {
              await this.processXmlAttachment(
                attachment.content,
                mail.from?.text || 'Desconhecido',
                config.tenantId,
              );
            }
          }
        } else {
          this.logger.warn('Nenhum anexo encontrado.');
        }

        // Marca como lido após processar
        await connection.addFlags(item.attributes.uid, '\\Seen');
      }

      connection.end();
    } catch (error) {
      this.logger.error(
        `Erro ao conectar no e-mail de ${config.tenant.name} (${config.host}): ${error.message}`,
      );
    }
  }

  private async processXmlAttachment(
    buffer: Buffer,
    sender: string,
    tenantId: string,
  ) {
    const xmlContent = buffer.toString('utf-8');

    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false, // Importante para não quebrar a chave de acesso numérica
    });

    try {
      const jsonObj = parser.parse(xmlContent);
      // Suporte a diferentes estruturas de XML (NFe pura ou nfeProc)
      const infNFe = jsonObj?.nfeProc?.NFe?.infNFe || jsonObj?.NFe?.infNFe;

      if (!infNFe) {
        this.logger.warn('>> XML não contém estrutura de NFe válida.');
        return;
      }

      let accessKey =
        jsonObj?.nfeProc?.protNFe?.infProt?.chNFe ||
        jsonObj?.protNFe?.infProt?.chNFe ||
        infNFe.Id?.replace('NFe', ''); // Fallback tentar pegar do ID da tag

      if (accessKey) {
        accessKey = String(accessKey);
      } else {
        this.logger.warn('>> XML sem chave de acesso chNFe.');
      }

      const exists = await this.prisma.nfeInbox.findFirst({
        where: { accessKey, tenantId },
      });

      if (exists) {
        this.logger.debug(`>> NFe ${accessKey} já existe. Ignorando.`);
        return;
      }

      const newNfe = await this.prisma.nfeInbox.create({
        data: {
          tenantId,
          accessKey: accessKey || 'SEM_CHAVE_' + Date.now(),
          senderEmail: sender,
          xmlContent,
          status: 'PENDING',
        },
      });

      this.logger.log(`✅ NFe salva no Inbox! Chave: ${accessKey}`);

      // 👇 AQUI ESTÁ O AJUSTE PARA O NOVO NOTIFICATIONS SERVICE VIA PUSHER 👇
      this.notificationsService.notifyTenant(
        tenantId, // 1. ID do Tenant (O canal será 'tenant-{tenantId}')
        'new-notification', // 2. Nome do Evento (O React precisa dar bind neste nome)
        {
          // 3. Payload (Os dados que vão chegar no Frontend)
          type: 'nfe',
          title: 'Nova Nota Fiscal',
          message: `Recebida de ${sender}. Clique para importar.`,
          link: `/nfe/inbox?open=${newNfe.id}`,
          actionLabel: 'Ver Nota',
          metadata: {
            id: newNfe.id,
            accessKey: newNfe.accessKey,
            sender: newNfe.senderEmail,
            receivedAt: newNfe.receivedAt,
          },
        },
        ['OWNER', 'ADMIN'], // 4. (Opcional) Array de Roles - Notifica apenas administradores/donos para não poluir os vendedores
      );
    } catch (e) {
      this.logger.error('Falha ao processar XML anexo', e);
    }
  }
}
