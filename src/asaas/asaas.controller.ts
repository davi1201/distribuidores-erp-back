import {
  Controller,
  Post,
  Param,
  UseGuards,
  Get,
  Body,
  Query,
} from '@nestjs/common';
import { AsaasService } from './asaas.service';
import { ClerkAuthGuard } from '../auth/guards/clerk-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { TransferRequestDto } from './dto/transfer-request.dto';
import { GeneratePixQrCodeDto } from './dto/generate-pix-qrcode.dto';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantRequired } from '../common/decorators/tenant-required.decorator';

@Controller('asaas')
@UseGuards(ClerkAuthGuard, RolesGuard, TenantGuard)
@TenantRequired()
export class AsaasController {
  constructor(private readonly asaasService: AsaasService) {}

  @Post('emit-boleto/:titleId')
  @Roles(Role.OWNER)
  async emitBoleto(
    @Param('titleId') titleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // TenantGuard garante que tenantId não é null
    return await this.asaasService.emitBoletoForExistingTitle(
      user.tenantId!,
      titleId,
    );
  }

  // ========================================================================
  // 3. CONSULTAR SALDO
  // ========================================================================
  @Get('balance')
  @Roles(Role.OWNER)
  async getBalance(@CurrentUser() user: AuthenticatedUser) {
    return await this.asaasService.getWalletBalance(user.tenantId!);
  }

  // ========================================================================
  // 4. SOLICITAR SAQUE (TRANSFERÊNCIA PIX/TED)
  // ========================================================================
  @Post('transfer')
  @Roles(Role.OWNER)
  async requestTransfer(
    @Body() transferData: TransferRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return await this.asaasService.requestTransfer(
      user.tenantId!,
      transferData,
    );
  }

  @Post('qrcode')
  async getPixQrCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GeneratePixQrCodeDto,
  ) {
    return await this.asaasService.generatePixIntentForPDV(
      user.tenantId!,
      dto.amount,
      dto.customerId,
    );
  }

  @Get('transactions')
  async getStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetTransactionsDto,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const tenantId = user.tenantId!;

    // Converte a página para o formato "offset" que o Asaas usa
    const limitNumber = parseInt(limit, 10);
    const offset = (parseInt(page, 10) - 1) * limitNumber;

    return this.asaasService.getFinancialStatement(tenantId, {
      startDate: query.startDate,
      endDate: query.endDate,
      offset,
      limit: limitNumber,
    });
  }
}
