import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger } from '../core/logging';
import * as nodemailer from 'nodemailer';
import { toNumber } from '../core/utils';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = createLogger(MailService.name);

  // É executado automaticamente quando o NestJS sobe
  async onModuleInit() {
    // Se não tivermos um usuário de e-mail no .env, usamos o Ethereal (Modo Teste)
    if (!process.env.MAIL_USER) {
      this.logger.log('Gerando conta de e-mail de teste (Ethereal)...');
      const testAccount = await nodemailer.createTestAccount();

      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.logger.log(
        `Serviço de E-mail pronto! Usuário Ethereal: ${testAccount.user}`,
      );
    } else {
      // Modo Produção: Lê as credenciais do seu arquivo .env
      this.transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: toNumber(process.env.MAIL_PORT),
        secure: process.env.MAIL_SECURE === 'true', // true para porta 465, false para outras
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      });
    }
  }

  // Método genérico que você poderá usar em qualquer lugar do sistema!
  async sendMail(to: string, subject: string, html: string) {
    try {
      const info = await this.transporter.sendMail({
        from: '"Meu ERP" <no-reply@meuerp.com.br>', // Altere para o nome do seu sistema
        to,
        subject,
        html,
      });

      this.logger.log(`E-mail enviado para: ${to}`);

      // 💡 A MÁGICA: Se estiver no modo de teste, gera um link pra você ver o e-mail no navegador!
      if (!process.env.MAIL_USER) {
        this.logger.log(
          `👀 VER E-MAIL NO NAVEGADOR: ${nodemailer.getTestMessageUrl(info)}`,
        );
      }

      return true;
    } catch (error) {
      this.logger.error(`Erro ao enviar e-mail para ${to}`, error.stack);
      return false;
    }
  }
}
