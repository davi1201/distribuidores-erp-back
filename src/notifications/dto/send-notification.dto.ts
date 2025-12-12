export type NotificationType =
  | 'nfe'
  | 'stock'
  | 'system'
  | 'order'
  | 'financial';

export class SendNotificationDto {
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string; // Opcional: URL para redirecionar ao clicar
  actionLabel?: string; // Opcional: Texto do botão
  metadata?: any; // Opcional: Dados extras (ex: ID do pedido, SKU)
  targetRoles?: string[];
  targetUsers?: string[];
}
