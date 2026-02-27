import { Injectable, Logger } from '@nestjs/common';
import Pusher from 'pusher';

@Injectable()
export class NotificationsService {
  private pusher: Pusher;
  private readonly logger = new Logger(NotificationsService.name);

  constructor() {
    // Estas chaves você pega no dashboard do Pusher ao criar o App
    this.pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID || '',
      key: process.env.PUSHER_KEY || '',
      secret: process.env.PUSHER_SECRET || '',
      cluster: process.env.PUSHER_CLUSTER || '',
      useTLS: true,
    });

    this.logger.log('✅ Pusher Service Inicializado para o Vendus-pro');
  }

  /**
   * Dispara notificações via Pusher.
   * O frontend deve dar "subscribe" nos canais equivalentes (ex: channel.bind('meu-evento', callback))
   */
  async notifyTenant(
    tenantId: string,
    event: string,
    payload: any,
    targetRoles?: string[],
    targetUsers?: string[],
  ) {
    try {
      // 1. PRIORIDADE: Envio Direto (Unicast)
      // Envia apenas para usuários específicos.
      if (targetUsers && targetUsers.length > 0) {
        // O Pusher permite disparar para múltiplos canais de uma vez (limite de 100 por chamada)
        const channels = targetUsers.map((userId) => `user-${userId}`);

        // chunk array se passar de 100 (limite da API do Pusher para trigger array)
        if (channels.length > 100) {
          this.logger.warn(
            'Muitos usuários alvo, considere refatorar para Broadcast',
          );
        }

        await this.pusher.trigger(channels.slice(0, 100), event, payload);
        this.logger.verbose(
          `Pusher Unicast: Evento '${event}' enviado para ${channels.length} usuários.`,
        );
        return;
      }

      // 2. Envio por Grupo (Multicast)
      if (targetRoles && targetRoles.length > 0) {
        const channels = targetRoles.map(
          (role) => `tenant-${tenantId}-${role}`,
        );
        await this.pusher.trigger(channels, event, payload);
        this.logger.verbose(
          `Pusher Multicast: Evento '${event}' enviado para as roles do tenant ${tenantId}.`,
        );
        return;
      }

      // 3. Envio Geral (Broadcast)
      await this.pusher.trigger(`tenant-${tenantId}`, event, payload);
      this.logger.verbose(
        `Pusher Broadcast: Evento '${event}' enviado para todo o tenant ${tenantId}.`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erro ao enviar notificação via Pusher: ${error.message}`,
        error,
      );
    }
  }
}
