import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3005',
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  // <--- Implemente
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('NotificationsGateway');

  // --- ADICIONE ESTE MÉTODO ---
  afterInit(server: Server) {
    this.logger.log(
      '✅ Gateway de Notificações INICIALIZADO na namespace /notifications',
    );
  }
  // -----------------------------

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('joinTenantRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tenantId: string; role: string; userId: string },
  ) {
    const { tenantId, role, userId } = payload;

    // Salas Gerais
    client.join(`tenant:${tenantId}`);
    client.join(`tenant:${tenantId}:${role}`);

    // --- MUDANÇA CRUCIAL PARA ESCALABILIDADE ---
    // O usuário entra na sua SALA PRIVADA.
    // Isso permite mandar msg só pra ele (Direct Message)
    if (userId) {
      client.join(`user:${userId}`);
    }

    this.logger.verbose(`User ${userId} entrou nas salas.`);
  }

  notifyTenant(
    tenantId: string,
    event: string,
    payload: any,
    targetRoles?: string[],
    targetUsers?: string[],
  ) {
    // 1. PRIORIDADE: Envio Direto (Unicast)
    // Se o service informou IDs específicos, mandamos SÓ para eles e encerramos.
    // Isso garante que os outros 999 sellers não recebam nada.
    if (targetUsers && targetUsers.length > 0) {
      targetUsers.forEach((userId) => {
        // Envia para a sala privada criada no handleJoinRoom
        this.server.to(`user:${userId}`).emit(event, payload);
      });
      return; // <--- O RETURN AQUI EVITA O BROADCAST ABAIXO
    }

    // 2. Envio por Grupo (Multicast)
    if (targetRoles && targetRoles.length > 0) {
      targetRoles.forEach((role) => {
        this.server.to(`tenant:${tenantId}:${role}`).emit(event, payload);
      });
      return;
    }

    // 3. Envio Geral (Broadcast)
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }
}
