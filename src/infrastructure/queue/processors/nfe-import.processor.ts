// ============================================================================
// NFE IMPORT PROCESSOR - Processa importação de NFe em background
// ============================================================================

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createLogger } from '../../../core/logging';
import { QUEUE_NAMES } from '../queue.constants';

export interface NfeImportJobData {
  tenantId: string;
  userId: string;
  fileBuffer: string; // Base64 encoded
  fileName: string;
  importType: 'CREATE_PRODUCTS' | 'LINK_EXISTING' | 'MIXED';
}

export interface NfeImportResult {
  success: boolean;
  productsCreated: number;
  productsLinked: number;
  errors: string[];
}

@Processor(QUEUE_NAMES.NFE_IMPORT)
export class NfeImportProcessor extends WorkerHost {
  private readonly logger = createLogger(NfeImportProcessor.name);

  async process(job: Job<NfeImportJobData>): Promise<NfeImportResult> {
    this.logger.log(`Processando importação de NFe`, {
      jobId: job.id,
      tenantId: job.data.tenantId,
      fileName: job.data.fileName,
    });

    try {
      // Atualiza progresso
      await job.updateProgress(10);

      // TODO: Implementar lógica de importação
      // const fileBuffer = Buffer.from(job.data.fileBuffer, 'base64');
      // const result = await this.nfeService.processImport(fileBuffer, job.data);

      await job.updateProgress(100);

      const result: NfeImportResult = {
        success: true,
        productsCreated: 0,
        productsLinked: 0,
        errors: [],
      };

      this.logger.log(`Importação concluída`, {
        jobId: job.id,
        ...result,
      });

      return result;
    } catch (error) {
      this.logger.error(`Falha na importação de NFe`, error.message, {
        jobId: job.id,
      });
      throw error;
    }
  }
}
