import {
  Controller,
  Post,
  Param,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Get,
  Body,
} from '@nestjs/common';
import { AsaasService } from './asaas.service';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('asaas')
@UseGuards(ClerkAuthGuard)
export class AsaasController {
  constructor(private readonly asaasService: AsaasService) {}

  // ========================================================================
  // 1. ATIVAR CONTA DIGITAL (SUBCONTA ASAAS)
  // ========================================================================
  @Post('tenant/activate')
  async activateAccount(@CurrentUser() user: any) {
    if (user.role !== 'OWNER') {
      throw new HttpException(
        'Acesso negado. Apenas administradores (OWNER) podem ativar a conta digital.',
        HttpStatus.FORBIDDEN,
      );
    }

    return await this.asaasService.createSubaccount(user.tenantId);
  }

  // ========================================================================
  // 2. EMITIR BOLETO (Para Títulos Existentes)
  // ========================================================================
  @Post('emit-boleto/:titleId')
  async emitBoleto(
    @Param('titleId') titleId: string,
    @CurrentUser() user: any,
  ) {
    if (user.role !== 'OWNER') {
      throw new HttpException(
        'Acesso negado. Apenas administradores (OWNER) podem emitir boletos.',
        HttpStatus.FORBIDDEN,
      );
    }

    return await this.asaasService.emitBoletoForExistingTitle(
      user.tenantId,
      titleId,
    );
  }

  // ========================================================================
  // 3. CONSULTAR SALDO
  // ========================================================================
  @Get('balance')
  async getBalance(@CurrentUser() user: any) {
    if (user.role !== 'OWNER') {
      throw new HttpException('Acesso negado.', HttpStatus.FORBIDDEN);
    }

    return await this.asaasService.getWalletBalance(user.tenantId);
  }

  // ========================================================================
  // 4. SOLICITAR SAQUE (TRANSFERÊNCIA PIX/TED)
  // ========================================================================
  @Post('transfer')
  async requestTransfer(@Body() transferData: any, @CurrentUser() user: any) {
    if (user.role !== 'OWNER') {
      throw new HttpException('Acesso negado.', HttpStatus.FORBIDDEN);
    }

    return await this.asaasService.requestTransfer(user.tenantId, transferData);
  }
}
