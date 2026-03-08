// ============================================================================
// COMMISSION PROCESSOR - Calcula comissões em background
// ============================================================================

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createLogger } from '../../../core/logging';
import { QUEUE_NAMES } from '../queue.constants';

export interface CommissionJobData {
  tenantId: string;
  orderId: string;
  userId: string;
}

export interface CommissionResult {
  success: boolean;
  commissionAmount: number;
  sellerId: string;
  recordId: string;
}

@Processor(QUEUE_NAMES.COMMISSION)
export class CommissionProcessor extends WorkerHost {
  private readonly logger = createLogger(CommissionProcessor.name);

  async process(job: Job<CommissionJobData>): Promise<CommissionResult> {
    this.logger.log(`Calculando comissão para pedido`, {
      jobId: job.id,
      orderId: job.data.orderId,
    });

    try {
      // TODO: Injetar CommissionsService quando necessário
      // const result = await this.commissionsService.calculateAndRegister(
      //   job.data.orderId,
      //   job.data.tenantId,
      // );

      const result: CommissionResult = {
        success: true,
        commissionAmount: 0,
        sellerId: '',
        recordId: '',
      };

      this.logger.log(`Comissão calculada`, {
        jobId: job.id,
        ...result,
      });

      return result;
    } catch (error) {
      this.logger.error(`Falha ao calcular comissão`, error.message, {
        jobId: job.id,
      });
      throw error;
    }
  }
}
