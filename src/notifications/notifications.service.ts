import { Injectable, Logger } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { SendNotificationDto } from './dto/send-notification.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly gateway: NotificationsGateway) {}

  /**
   * Envia uma notificação em tempo real para todos os usuários de um Tenant.
   */
  send(dto: SendNotificationDto) {
    const payload = {
      id: uuidv4(),
      timestamp: new Date(),
      read: false,
      // Espalha os dados do DTO (type, title, message, link, etc)
      ...dto,
    };

    // 'notification' é o evento genérico que o seu hook useSocketListener.ts está ouvindo
    this.gateway.notifyTenant(
      dto.tenantId,
      'notification',
      payload,
      dto.targetRoles,
      dto.targetUsers,
    );

    this.logger.log(
      `🔔 Notificação enviada para Tenant ${dto.tenantId}: ${dto.title}`,
    );
  }
}
