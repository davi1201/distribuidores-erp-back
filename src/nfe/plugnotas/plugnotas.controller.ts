import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFile,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PlugNotasNFeService } from './plugnotas-nfe.service';
import { ClerkAuthGuard } from '../../auth/guards/clerk-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import {
  EmitirNFeDto,
  CancelarNFeDto,
  CartaCorrecaoDto,
  InutilizarNumeracaoDto,
  ListarNFeDto,
  EmitirNFeFromOrderDto,
  CreateEmpresaPlugNotasDto,
  UploadCertificadoDto,
} from './dto';
import { ConfigService } from '@nestjs/config';

@Controller('plugnotas')
export class PlugNotasController {
  constructor(
    private readonly plugNotasService: PlugNotasNFeService,
    private readonly configService: ConfigService,
  ) {}

  // ==================== EMPRESA ====================

  /**
   * Cadastra ou atualiza empresa emitente no PlugNotas
   */
  @Post('empresa')
  @UseGuards(ClerkAuthGuard)
  async cadastrarEmpresa(
    @Body() dto: CreateEmpresaPlugNotasDto,
    @CurrentUser() user: User,
  ) {
    return this.plugNotasService.cadastrarEmpresaEmitente(user.tenantId!, dto);
  }

  /**
   * Consulta empresa emitente cadastrada
   */
  @Get('empresa')
  @UseGuards(ClerkAuthGuard)
  async consultarEmpresa(@CurrentUser() user: User) {
    return this.plugNotasService.consultarEmpresaEmitente(user.tenantId!);
  }

  // ==================== CERTIFICADO ====================

  /**
   * Envia certificado digital A1
   */
  @Post('certificado')
  @UseGuards(ClerkAuthGuard)
  @UseInterceptors(FileInterceptor('arquivo'))
  async enviarCertificado(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadCertificadoDto,
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new Error('Arquivo do certificado é obrigatório');
    }

    const arquivoBase64 = file.buffer.toString('base64');

    return this.plugNotasService.enviarCertificado(
      user.tenantId!,
      dto.cpfCnpj,
      arquivoBase64,
      dto.senha,
    );
  }

  /**
   * Consulta status do certificado
   */
  @Get('certificado')
  @UseGuards(ClerkAuthGuard)
  async consultarCertificado(@CurrentUser() user: User) {
    return this.plugNotasService.consultarCertificado(user.tenantId!);
  }

  // ==================== NFE ====================

  /**
   * Emite NF-e manualmente
   */
  @Post('nfe/emitir')
  @UseGuards(ClerkAuthGuard)
  async emitirNFe(@Body() dto: EmitirNFeDto, @CurrentUser() user: User) {
    return this.plugNotasService.emitirNFe(user.tenantId!, dto, user);
  }

  /**
   * Emite NF-e a partir de um pedido
   */
  @Post('nfe/emitir-pedido')
  @UseGuards(ClerkAuthGuard)
  async emitirNFeFromOrder(
    @Body() dto: EmitirNFeFromOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.plugNotasService.emitirNFeFromOrder(user.tenantId!, dto, user);
  }

  /**
   * Consulta status de uma NF-e
   */
  @Get('nfe/:idIntegracao')
  @UseGuards(ClerkAuthGuard)
  async consultarNFe(
    @Param('idIntegracao') idIntegracao: string,
    @CurrentUser() user: User,
  ) {
    return this.plugNotasService.consultarNFe(user.tenantId!, idIntegracao);
  }

  /**
   * Lista NF-es (da API PlugNotas)
   */
  @Get('nfe')
  @UseGuards(ClerkAuthGuard)
  async listarNFes(@Query() dto: ListarNFeDto, @CurrentUser() user: User) {
    return this.plugNotasService.listarNFes(user.tenantId!, dto);
  }

  /**
   * Lista NF-es (do banco local)
   */
  @Get('nfe-local')
  @UseGuards(ClerkAuthGuard)
  async listarNFesLocal(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Query('orderId') orderId: string,
    @CurrentUser() user: User,
  ) {
    return this.plugNotasService.listarNFesLocal(user.tenantId!, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      orderId,
    });
  }

  /**
   * Cancela uma NF-e
   */
  @Post('nfe/cancelar')
  @UseGuards(ClerkAuthGuard)
  async cancelarNFe(@Body() dto: CancelarNFeDto, @CurrentUser() user: User) {
    return this.plugNotasService.cancelarNFe(user.tenantId!, dto, user);
  }

  /**
   * Emite carta de correção
   */
  @Post('nfe/carta-correcao')
  @UseGuards(ClerkAuthGuard)
  async emitirCartaCorrecao(
    @Body() dto: CartaCorrecaoDto,
    @CurrentUser() user: User,
  ) {
    return this.plugNotasService.emitirCartaCorrecao(user.tenantId!, dto, user);
  }

  /**
   * Inutiliza faixa de numeração
   */
  @Post('nfe/inutilizar')
  @UseGuards(ClerkAuthGuard)
  async inutilizarNumeracao(
    @Body() dto: InutilizarNumeracaoDto,
    @CurrentUser() user: User,
  ) {
    return this.plugNotasService.inutilizarNumeracao(user.tenantId!, dto, user);
  }

  // ==================== DOWNLOADS ====================

  /**
   * Download do PDF da NF-e
   */
  @Get('nfe/:idIntegracao/pdf')
  @UseGuards(ClerkAuthGuard)
  async downloadPDF(
    @Param('idIntegracao') idIntegracao: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.plugNotasService.downloadPDF(
      user.tenantId!,
      idIntegracao,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=nfe-${idIntegracao}.pdf`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  /**
   * Download do XML da NF-e
   */
  @Get('nfe/:idIntegracao/xml')
  @UseGuards(ClerkAuthGuard)
  async downloadXML(
    @Param('idIntegracao') idIntegracao: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const xml = await this.plugNotasService.downloadXML(
      user.tenantId!,
      idIntegracao,
    );

    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename=nfe-${idIntegracao}.xml`,
    });

    res.send(xml);
  }

  // ==================== WEBHOOK ====================

  /**
   * Recebe webhook de atualização de status da NF-e
   * Este endpoint deve ser configurado no painel do PlugNotas
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-webhook-token') webhookToken: string,
  ) {
    // Valida token do webhook (opcional, mas recomendado)
    const expectedToken = this.configService.get<string>(
      'PLUGNOTAS_WEBHOOK_TOKEN',
    );

    if (expectedToken && webhookToken !== expectedToken) {
      return { received: false, reason: 'Invalid token' };
    }

    await this.plugNotasService.processWebhook(payload);

    return { received: true };
  }
}
