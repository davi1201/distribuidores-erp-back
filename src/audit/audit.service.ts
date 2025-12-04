import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

interface CreateLogDto {
  action: string;
  entity: string;
  entityId?: string;
  userId: string;
  details?: any;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: CreateLogDto) {
    await this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        details: data.details,
        ipAddress: data.ipAddress,
      },
    });
  }
}
