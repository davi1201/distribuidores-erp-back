// ============================================================================
// EMAIL PROCESSOR - Processa envio de emails em background
// ============================================================================

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createLogger } from '../../../core/logging';
import { QUEUE_NAMES } from '../queue.constants';

export interface EmailJobData {
  to: string | string[];
  subject: string;
  template: string;
  context: Record<string, unknown>;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
  }>;
}

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = createLogger(EmailProcessor.name);

  async process(job: Job<EmailJobData>): Promise<void> {
    this.logger.log(`Processando email job ${job.id}`, {
      to: Array.isArray(job.data.to) ? job.data.to.join(', ') : job.data.to,
      subject: job.data.subject,
    });

    try {
      // TODO: Injetar MailService quando necessário
      // await this.mailService.send(job.data);

      this.logger.log(`Email enviado com sucesso`, { jobId: job.id });
    } catch (error) {
      this.logger.error(`Falha ao enviar email`, error.message, {
        jobId: job.id,
      });
      throw error; // Relança para retry automático
    }
  }
}
