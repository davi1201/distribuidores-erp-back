import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlugNotasApiService } from './plugnotas-api.service';
import type { User, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  EmitirNFeDto,
  CancelarNFeDto,
  CartaCorrecaoDto,
  InutilizarNumeracaoDto,
  ListarNFeDto,
  EmitirNFeFromOrderDto,
  CreateEmpresaPlugNotasDto,
  FormaPagamento,
  ModalidadeFrete,
  IndicadorIE,
} from './dto';
import type {
  PlugNotasNFe,
  PlugNotasNFeItem,
  PlugNotasNFeResponse,
  PlugNotasEmpresa,
  PlugNotasNFePagamento,
} from './plugnotas.types';

@Injectable()
export class PlugNotasNFeService {
  private readonly logger = new Logger(PlugNotasNFeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plugNotasApi: PlugNotasApiService,
  ) {}

  // ==================== EMPRESA ====================

  /**
   * Cadastra ou atualiza a empresa emitente do tenant no PlugNotas
   */
  async cadastrarEmpresaEmitente(
    tenantId: string,
    dto: CreateEmpresaPlugNotasDto,
  ): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    // Verifica se já existe
    const existente = await this.plugNotasApi.consultarEmpresa(
      dto.cpfCnpj,
      apiKey,
    );

    const empresaData: PlugNotasEmpresa = {
      cpfCnpj: this.formatDocument(dto.cpfCnpj),
      razaoSocial: dto.razaoSocial,
      nomeFantasia: dto.nomeFantasia,
      inscricaoEstadual: dto.inscricaoEstadual,
      inscricaoMunicipal: dto.inscricaoMunicipal,
      regimeTributario: dto.regimeTributario,
      email: dto.email,
      telefone: dto.telefone,
      endereco: {
        logradouro: dto.endereco.logradouro,
        numero: dto.endereco.numero,
        complemento: dto.endereco.complemento,
        bairro: dto.endereco.bairro,
        codigoCidade: dto.endereco.codigoCidade,
        descricaoCidade: dto.endereco.descricaoCidade,
        estado: dto.endereco.estado,
        cep: dto.endereco.cep.replace(/\D/g, ''),
        telefone: dto.endereco.telefone,
      },
      nfeConfig: {
        ambiente: dto.ambiente || 2, // Default: Homologação
      },
    };

    if (existente) {
      // Atualiza
      const result = await this.plugNotasApi.atualizarEmpresa(
        dto.cpfCnpj,
        empresaData,
        apiKey,
      );

      // Salva referência no tenant
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          plugnotasEmpresaCnpj: this.formatDocument(dto.cpfCnpj),
        },
      });

      return result;
    }

    // Cadastra nova
    const result = await this.plugNotasApi.cadastrarEmpresa(
      empresaData,
      apiKey,
    );

    // Salva referência no tenant
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plugnotasEmpresaCnpj: this.formatDocument(dto.cpfCnpj),
      },
    });

    return result;
  }

  /**
   * Consulta empresa emitente
   */
  async consultarEmpresaEmitente(tenantId: string): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);

    if (!tenant.plugnotasEmpresaCnpj) {
      throw new NotFoundException('Empresa emitente não configurada');
    }

    const apiKey = this.getTenantApiKey(tenant);
    return this.plugNotasApi.consultarEmpresa(
      tenant.plugnotasEmpresaCnpj,
      apiKey,
    );
  }

  // ==================== CERTIFICADO ====================

  /**
   * Envia certificado digital A1
   */
  async enviarCertificado(
    tenantId: string,
    cpfCnpj: string,
    arquivoBase64: string,
    senha: string,
  ): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    const result = await this.plugNotasApi.enviarCertificado(
      cpfCnpj,
      arquivoBase64,
      senha,
      apiKey,
    );

    // Atualiza status do certificado no tenant
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plugnotasCertificadoValido: true,
        plugnotasCertificadoVencimento: result.dataValidade
          ? new Date(result.dataValidade)
          : null,
      },
    });

    return result;
  }

  /**
   * Consulta status do certificado
   */
  async consultarCertificado(tenantId: string): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);

    if (!tenant.plugnotasEmpresaCnpj) {
      throw new NotFoundException('Empresa emitente não configurada');
    }

    const apiKey = this.getTenantApiKey(tenant);
    return this.plugNotasApi.consultarCertificado(
      tenant.plugnotasEmpresaCnpj,
      apiKey,
    );
  }

  // ==================== NFE ====================

  /**
   * Emite uma NF-e manual
   */
  async emitirNFe(
    tenantId: string,
    dto: EmitirNFeDto,
    user: User,
  ): Promise<PlugNotasNFeResponse> {
    const tenant = await this.getTenantWithConfig(tenantId);
    this.validateTenantCanEmit(tenant);

    const apiKey = this.getTenantApiKey(tenant);
    const idIntegracao = dto.idIntegracao || uuidv4();

    // Monta payload para PlugNotas
    const nfePayload = this.buildNFePayload(tenant, dto, idIntegracao);

    // Envia para API
    const result = await this.plugNotasApi.emitirNFe(nfePayload, apiKey);
    this.logger.debug(`Resultado emissão NFe: ${JSON.stringify(result)}`);

    // Salva registro local
    await this.saveNFeRecord(tenantId, {
      idIntegracao,
      plugnotasId: result.id, // ID do PlugNotas para download
      orderId: dto.orderId,
      status: result.status,
      chaveAcesso: result.chaveAcesso,
      numero: result.numero,
      serie: result.serie,
      protocolo: result.protocolo,
      destinatarioDoc: dto.destinatario.cpfCnpj,
      destinatarioNome: dto.destinatario.razaoSocial,
      valorTotal: dto.itens.reduce(
        (acc, item) =>
          acc + item.quantidadeComercial * item.valorUnitarioComercial,
        0,
      ),
      naturezaOperacao: dto.naturezaOperacao,
      userId: user.id,
    });

    return result;
  }

  /**
   * Emite NF-e a partir de um pedido existente
   */
  async emitirNFeFromOrder(
    tenantId: string,
    dto: EmitirNFeFromOrderDto,
    user: User,
  ): Promise<PlugNotasNFeResponse> {
    const tenant = await this.getTenantWithConfig(tenantId);
    this.validateTenantCanEmit(tenant);

    // Busca o pedido completo
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId },
      include: {
        customer: {
          include: {
            addresses: {
              include: { city: true, state: true },
              take: 1,
            },
          },
        },
        items: {
          include: {
            product: {
              include: { ncm: true, cfop: true, cest: true, taxProfile: true },
            },
          },
        },
        payments: {
          include: { tenantPaymentMethod: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.status === 'CANCELED') {
      throw new BadRequestException(
        'Não é possível emitir NF-e de pedido cancelado',
      );
    }

    // Verifica se já existe NF-e para este pedido
    const existingNFe = await this.prisma.nfeEmitida.findFirst({
      where: {
        tenantId,
        orderId: order.id,
        status: { in: ['AUTORIZADO', 'PROCESSANDO'] },
      },
    });

    if (existingNFe) {
      throw new BadRequestException(
        'Já existe uma NF-e emitida ou em processamento para este pedido',
      );
    }

    const apiKey = this.getTenantApiKey(tenant);
    const idIntegracao = uuidv4();

    // Monta dados do destinatário
    const address = order.customer.addresses[0];
    const destinatario = {
      cpfCnpj: order.customer.document || '',
      razaoSocial: order.customer.corporateName || order.customer.name,
      email: order.customer.email || undefined,
      inscricaoEstadual: order.customer.stateRegistration || undefined,
      indicadorInscricaoEstadual: order.customer.isICMSContributor
        ? IndicadorIE.CONTRIBUINTE
        : order.customer.isExempt
          ? IndicadorIE.ISENTO
          : IndicadorIE.NAO_CONTRIBUINTE,
      endereco: address
        ? {
            logradouro: address.street || '',
            numero: address.number || 'S/N',
            complemento: address.complement || undefined,
            bairro: address.neighborhood || '',
            codigoCidade: address.ibgeCode || address.city?.ibgeCode || '',
            descricaoCidade: address.city?.name || '',
            estado: address.state?.uf || '',
            cep: (address.zipCode || '').replace(/\D/g, ''),
          }
        : undefined,
    };

    // Obtém regime tributário do tenant (default: Simples Nacional)
    const regimeTributario = tenant.regimeTributario || 1;

    // Monta itens no formato PlugNotas
    const itens: PlugNotasNFeItem[] = order.items.map((item) => {
      // Garante que NCM existe (obrigatório)
      const ncm = item.product.ncmCode || item.product.ncm?.code || '00000000';
      const valorUnitario = Number(item.unitPrice);
      const quantidade = Number(item.quantity);
      const valorTotal = Number(item.totalPrice) || valorUnitario * quantidade;

      return {
        codigo: item.product.sku || item.product.id,
        descricao: item.product.name,
        ncm: ncm.replace(/\D/g, ''), // Remove formatação
        cest: item.product.cestCode || undefined,
        cfop: item.product.cfopCode || '5102', // CFOP padrão para venda
        unidade: item.product.unit || 'UN',
        quantidade: quantidade,
        valorUnitario: {
          comercial: valorUnitario,
          tributavel: valorUnitario,
        },
        valor: valorTotal,
        codigoBarras: item.product.ean || undefined,
        tributos: this.buildTributosFromProduct(
          item.product,
          item,
          regimeTributario,
        ),
      };
    });

    // Monta pagamentos no formato PlugNotas
    const pagamentos = this.buildPagamentosFromOrder(order);

    // Monta payload no formato PlugNotas
    const nfePayload: PlugNotasNFe = {
      idIntegracao,
      natureza: dto.naturezaOperacao || 'VENDA DE MERCADORIA',
      presencial: '1', // 1=Presencial
      consumidorFinal: order.customer.isFinalConsumer ?? true,
      emitente: {
        cpfCnpj: tenant.plugnotasEmpresaCnpj!,
      },
      destinatario,
      itens,
      pagamentos,
    };

    // Log para debug
    this.logger.debug(`Payload NFe: ${JSON.stringify(nfePayload, null, 2)}`);

    // Envia para API
    const result = await this.plugNotasApi.emitirNFe(nfePayload, apiKey);
    this.logger.debug(`Resultado emissão NFe: ${JSON.stringify(result)}`);

    // Salva registro local
    await this.saveNFeRecord(tenantId, {
      idIntegracao,
      plugnotasId: result.id, // ID do PlugNotas para download
      orderId: order.id,
      status: result.status,
      chaveAcesso: result.chaveAcesso,
      numero: result.numero,
      serie: result.serie,
      protocolo: result.protocolo,
      destinatarioDoc: order.customer.document || undefined,
      destinatarioNome: order.customer.corporateName || order.customer.name,
      valorTotal: Number(order.total),
      naturezaOperacao: dto.naturezaOperacao || 'Venda de Mercadoria',
      userId: user.id,
    });

    // Atualiza status do pedido
    if (result.status === 'AUTORIZADO') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'INVOICED' },
      });
    }

    return result;
  }

  /**
   * Consulta status de uma NF-e
   * Busca pelo protocolo usando o endpoint /nfe/{protocolo}/resumo
   */
  async consultarNFe(tenantId: string, idIntegracao: string): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    // Primeiro busca o registro local para obter o protocolo
    const nfeLocal = await this.prisma.nfeEmitida.findFirst({
      where: { tenantId, idIntegracao },
    });

    if (!nfeLocal) {
      throw new NotFoundException(`NFe com ID ${idIntegracao} não encontrada`);
    }

    // Se tem protocolo, busca o resumo na API
    if (nfeLocal.protocolo) {
      const result = await this.plugNotasApi.consultarNFeResumo(
        nfeLocal.protocolo,
        apiKey,
      );

      if (result) {
        // Atualiza registro local com dados atualizados (incluindo plugnotasId)
        await this.prisma.nfeEmitida.update({
          where: { id: nfeLocal.id },
          data: {
            plugnotasId: result.id || nfeLocal.plugnotasId,
            status: result.status,
            chaveAcesso: result.chaveAcesso,
            numero: result.numero,
            protocolo: result.protocolo || nfeLocal.protocolo,
            mensagem: result.mensagem,
            dataAutorizacao: result.dataAutorizacao
              ? this.parseDate(result.dataAutorizacao)
              : null,
          },
        });

        return {
          ...result,
          plugnotasId: result.id,
          orderId: nfeLocal.orderId,
        };
      }
    }

    // Se não encontrou na API ou não tem protocolo, retorna dados locais
    return {
      id: nfeLocal.id,
      idIntegracao: nfeLocal.idIntegracao,
      plugnotasId: nfeLocal.plugnotasId || undefined,
      status:
        nfeLocal.status === 'PROCESSANDO' ? 'PROCESSANDO' : nfeLocal.status,
      chaveAcesso: nfeLocal.chaveAcesso || undefined,
      numero: nfeLocal.numero || undefined,
      serie: nfeLocal.serie || undefined,
      protocolo: nfeLocal.protocolo || undefined,
      mensagem: nfeLocal.mensagem || 'Nota em processamento',
      dataAutorizacao: nfeLocal.dataAutorizacao?.toISOString(),
      orderId: nfeLocal.orderId,
      valorTotal: nfeLocal.valorTotal,
      destinatarioNome: nfeLocal.destinatarioNome,
      destinatarioDocumento: nfeLocal.destinatarioDocumento,
    };
  }

  /**
   * Parse de data no formato dd/mm/yyyy
   */
  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    // Se já for ISO, retorna como Date
    if (dateStr.includes('T') || dateStr.includes('-')) {
      return new Date(dateStr);
    }
    // Formato dd/mm/yyyy
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return null;
  }

  /**
   * Lista NF-es emitidas
   */
  async listarNFes(tenantId: string, dto: ListarNFeDto): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    // Lista da API
    const apiResult = await this.plugNotasApi.listarNFes(
      {
        pagina: dto.pagina,
        limite: dto.limite,
        status: dto.status,
        cpfCnpjEmitente: tenant.plugnotasEmpresaCnpj || undefined,
        dataInicio: dto.dataInicio,
        dataFim: dto.dataFim,
      },
      apiKey,
    );

    return apiResult;
  }

  /**
   * Lista NF-es emitidas (do banco local)
   */
  async listarNFesLocal(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      orderId?: string;
    },
  ): Promise<any> {
    const { page = 1, limit = 20, status, orderId } = options;

    const where: Prisma.NfeEmitidaWhereInput = {
      tenantId,
      ...(status && { status }),
      ...(orderId && { orderId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.nfeEmitida.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          order: {
            select: { id: true, code: true },
          },
        },
      }),
      this.prisma.nfeEmitida.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Cancela uma NF-e
   */
  async cancelarNFe(
    tenantId: string,
    dto: CancelarNFeDto,
    user: User,
  ): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    // Verifica se a NF-e existe e está autorizada
    const nfeLocal = await this.prisma.nfeEmitida.findFirst({
      where: { tenantId, idIntegracao: dto.idIntegracao },
    });

    if (!nfeLocal) {
      throw new NotFoundException('NF-e não encontrada');
    }

    if (nfeLocal.status !== 'AUTORIZADO') {
      throw new BadRequestException(
        'Apenas NF-es autorizadas podem ser canceladas',
      );
    }

    const result = await this.plugNotasApi.cancelarNFe(
      {
        idIntegracao: dto.idIntegracao,
        justificativa: dto.justificativa,
      },
      apiKey,
    );

    // Atualiza registro local
    await this.prisma.nfeEmitida.update({
      where: { id: nfeLocal.id },
      data: {
        status: result.status === 'CANCELADO' ? 'CANCELADO' : nfeLocal.status,
        protocoloCancelamento: result.protocolo,
        dataCancelamento: result.dataEvento
          ? new Date(result.dataEvento)
          : null,
        justificativaCancelamento: dto.justificativa,
      },
    });

    // Se o pedido estava faturado, volta para confirmado
    if (nfeLocal.orderId && result.status === 'CANCELADO') {
      await this.prisma.order.update({
        where: { id: nfeLocal.orderId },
        data: { status: 'CONFIRMED' },
      });
    }

    return result;
  }

  /**
   * Emite carta de correção
   */
  async emitirCartaCorrecao(
    tenantId: string,
    dto: CartaCorrecaoDto,
    user: User,
  ): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    // Verifica se a NF-e existe e está autorizada
    const nfeLocal = await this.prisma.nfeEmitida.findFirst({
      where: { tenantId, idIntegracao: dto.idIntegracao },
    });

    if (!nfeLocal) {
      throw new NotFoundException('NF-e não encontrada');
    }

    if (nfeLocal.status !== 'AUTORIZADO') {
      throw new BadRequestException(
        'Carta de correção só pode ser emitida para NF-es autorizadas',
      );
    }

    const result = await this.plugNotasApi.cartaCorrecao(
      {
        idIntegracao: dto.idIntegracao,
        correcao: dto.correcao,
      },
      apiKey,
    );

    // Salva evento de carta de correção
    await this.prisma.nfeEvento.create({
      data: {
        nfeId: nfeLocal.id,
        tipo: 'CARTA_CORRECAO',
        sequencia: result.sequencia,
        protocolo: result.protocolo,
        dataEvento: result.dataEvento
          ? new Date(result.dataEvento)
          : new Date(),
        descricao: dto.correcao,
        status: result.status,
      },
    });

    return result;
  }

  /**
   * Inutiliza faixa de numeração
   */
  async inutilizarNumeracao(
    tenantId: string,
    dto: InutilizarNumeracaoDto,
    user: User,
  ): Promise<any> {
    const tenant = await this.getTenantWithConfig(tenantId);
    this.validateTenantCanEmit(tenant);

    const apiKey = this.getTenantApiKey(tenant);

    const result = await this.plugNotasApi.inutilizarNumeracao(
      {
        cpfCnpj: tenant.plugnotasEmpresaCnpj!,
        serie: dto.serie,
        numeroInicial: dto.numeroInicial,
        numeroFinal: dto.numeroFinal,
        justificativa: dto.justificativa,
      },
      apiKey,
    );

    // Salva registro de inutilização
    await this.prisma.nfeInutilizacao.create({
      data: {
        tenantId,
        serie: dto.serie,
        numeroInicial: dto.numeroInicial,
        numeroFinal: dto.numeroFinal,
        justificativa: dto.justificativa,
        protocolo: result.protocolo,
        status: result.status,
        userId: user.id,
      },
    });

    return result;
  }

  // ==================== DOWNLOADS ====================

  /**
   * Download do PDF da NF-e
   * Usa o plugnotasId salvo no banco ou consulta a API para obter
   */
  async downloadPDF(tenantId: string, idIntegracao: string): Promise<Buffer> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    // Busca os dados da NFe
    const nfeLocal = await this.prisma.nfeEmitida.findFirst({
      where: { tenantId, idIntegracao },
    });

    if (!nfeLocal) {
      throw new NotFoundException('NF-e não encontrada');
    }

    this.logger.debug(
      `Download PDF - idIntegracao: ${idIntegracao}, plugnotasId: ${nfeLocal.plugnotasId}, protocolo: ${nfeLocal.protocolo}`,
    );

    // Se já tem o plugnotasId salvo, usa direto
    if (nfeLocal.plugnotasId) {
      return this.plugNotasApi.downloadPDF(nfeLocal.plugnotasId, apiKey);
    }

    // Se tem protocolo, busca da API para obter o ID ou URL
    if (nfeLocal.protocolo) {
      const nfeData = await this.plugNotasApi.consultarNFeResumo(
        nfeLocal.protocolo,
        apiKey,
      );

      this.logger.debug(
        `NFe data from API: id=${nfeData?.id}, urlPdf=${nfeData?.urlPdf}`,
      );

      // Atualiza o registro local com o plugnotasId para próximas consultas
      if (nfeData?.id && !nfeLocal.plugnotasId) {
        await this.prisma.nfeEmitida.update({
          where: { id: nfeLocal.id },
          data: { plugnotasId: nfeData.id },
        });
      }

      if (nfeData?.urlPdf) {
        return this.plugNotasApi.downloadFromUrl(nfeData.urlPdf);
      }

      if (nfeData?.id) {
        return this.plugNotasApi.downloadPDF(nfeData.id, apiKey);
      }
    }

    throw new BadRequestException(
      'Não foi possível baixar o PDF. NFe ainda não processada.',
    );
  }

  /**
   * Download do XML da NF-e
   * Usa o plugnotasId salvo no banco ou consulta a API para obter
   */
  async downloadXML(tenantId: string, idIntegracao: string): Promise<string> {
    const tenant = await this.getTenantWithConfig(tenantId);
    const apiKey = this.getTenantApiKey(tenant);

    // Busca os dados da NFe
    const nfeLocal = await this.prisma.nfeEmitida.findFirst({
      where: { tenantId, idIntegracao },
    });

    if (!nfeLocal) {
      throw new NotFoundException('NF-e não encontrada');
    }

    this.logger.debug(
      `Download XML - idIntegracao: ${idIntegracao}, plugnotasId: ${nfeLocal.plugnotasId}, protocolo: ${nfeLocal.protocolo}`,
    );

    // Se já tem o plugnotasId salvo, usa direto
    if (nfeLocal.plugnotasId) {
      return this.plugNotasApi.downloadXML(nfeLocal.plugnotasId, apiKey);
    }

    // Se tem protocolo, busca da API para obter o ID ou URL
    if (nfeLocal.protocolo) {
      const nfeData = await this.plugNotasApi.consultarNFeResumo(
        nfeLocal.protocolo,
        apiKey,
      );

      this.logger.debug(
        `NFe data from API: id=${nfeData?.id}, urlXml=${nfeData?.urlXml}`,
      );

      // Atualiza o registro local com o plugnotasId para próximas consultas
      if (nfeData?.id && !nfeLocal.plugnotasId) {
        await this.prisma.nfeEmitida.update({
          where: { id: nfeLocal.id },
          data: { plugnotasId: nfeData.id },
        });
      }

      if (nfeData?.urlXml) {
        return this.plugNotasApi.downloadFromUrlText(nfeData.urlXml);
      }

      if (nfeData?.id) {
        return this.plugNotasApi.downloadXML(nfeData.id, apiKey);
      }
    }

    throw new BadRequestException(
      'Não foi possível baixar o XML. NFe ainda não processada.',
    );
  }

  // ==================== WEBHOOK ====================

  /**
   * Processa webhook de atualização de status da NF-e
   */
  async processWebhook(payload: any): Promise<void> {
    const { idIntegracao, status, chaveAcesso, numero, serie, protocolo } =
      payload;

    if (!idIntegracao) {
      this.logger.warn('Webhook recebido sem idIntegracao');
      return;
    }

    const nfe = await this.prisma.nfeEmitida.findFirst({
      where: { idIntegracao },
    });

    if (!nfe) {
      this.logger.warn(
        `Webhook: NF-e com idIntegracao ${idIntegracao} não encontrada`,
      );
      return;
    }

    // Atualiza registro
    await this.prisma.nfeEmitida.update({
      where: { id: nfe.id },
      data: {
        status,
        chaveAcesso,
        numero,
        serie,
        protocolo,
        mensagem: payload.mensagem || payload.motivo,
        dataAutorizacao: payload.dataAutorizacao
          ? new Date(payload.dataAutorizacao)
          : null,
      },
    });

    // Se autorizado, atualiza pedido
    if (status === 'AUTORIZADO' && nfe.orderId) {
      await this.prisma.order.update({
        where: { id: nfe.orderId },
        data: { status: 'INVOICED' },
      });
    }

    this.logger.log(
      `Webhook processado: NF-e ${idIntegracao} -> Status: ${status}`,
    );
  }

  // ==================== HELPERS PRIVADOS ====================

  private async getTenantWithConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    return tenant;
  }

  private getTenantApiKey(tenant: any): string {
    if (!tenant.plugnotasApiKey) {
      throw new BadRequestException(
        'API Key do PlugNotas não configurada para este tenant',
      );
    }
    return tenant.plugnotasApiKey;
  }

  private validateTenantCanEmit(tenant: any): void {
    if (!tenant.plugnotasApiKey) {
      throw new BadRequestException('API Key do PlugNotas não configurada');
    }

    if (!tenant.plugnotasEmpresaCnpj) {
      throw new BadRequestException('Empresa emitente não cadastrada');
    }

    if (!tenant.plugnotasCertificadoValido) {
      throw new BadRequestException(
        'Certificado digital não configurado ou inválido',
      );
    }
  }

  private formatDocument(doc: string): string {
    return doc.replace(/[^\d]/g, '');
  }

  private buildNFePayload(
    tenant: any,
    dto: EmitirNFeDto,
    idIntegracao: string,
  ): PlugNotasNFe {
    // Calcula valor total
    const valorTotal = dto.itens.reduce(
      (acc, item) =>
        acc +
        (item.valorTotal ||
          item.quantidadeComercial * item.valorUnitarioComercial),
      0,
    );

    // Obtém regime tributário do tenant
    const regimeTributario = tenant.regimeTributario || 1;

    return {
      idIntegracao,
      natureza: dto.naturezaOperacao || 'VENDA DE MERCADORIA',
      presencial: String(dto.presencaComprador || 1),
      consumidorFinal: dto.consumidorFinal ?? true,
      emitente: {
        cpfCnpj: tenant.plugnotasEmpresaCnpj,
      },
      destinatario: {
        cpfCnpj: this.formatDocument(dto.destinatario.cpfCnpj),
        razaoSocial: dto.destinatario.razaoSocial,
        email: dto.destinatario.email,
        inscricaoEstadual: dto.destinatario.inscricaoEstadual,
        indicadorInscricaoEstadual: dto.destinatario.indicadorInscricaoEstadual,
        endereco: dto.destinatario.endereco
          ? {
              logradouro: dto.destinatario.endereco.logradouro,
              numero: dto.destinatario.endereco.numero,
              complemento: dto.destinatario.endereco.complemento,
              bairro: dto.destinatario.endereco.bairro,
              codigoCidade: dto.destinatario.endereco.codigoCidade,
              descricaoCidade: dto.destinatario.endereco.descricaoCidade,
              estado: dto.destinatario.endereco.estado,
              cep: dto.destinatario.endereco.cep.replace(/\D/g, ''),
            }
          : undefined,
      },
      itens: dto.itens.map((item) => {
        const valorUnitario = item.valorUnitarioComercial;
        const quantidade = item.quantidadeComercial;
        const valor = item.valorTotal || valorUnitario * quantidade;

        // Usa item.tributos se fornecido, senão aplica padrão do regime
        const tributos =
          item.tributos || this.getDefaultTributos(regimeTributario);

        return {
          codigo: item.codigo,
          descricao: item.descricao,
          ncm: item.ncm,
          cest: item.cest,
          cfop: item.cfop,
          unidade: item.unidadeComercial,
          quantidade: quantidade,
          valorUnitario: {
            comercial: valorUnitario,
            tributavel: valorUnitario,
          },
          valor: valor,
          codigoBarras: item.codigoBarras,
          informacoesAdicionais: item.informacoesAdicionais,
          tributos,
        };
      }),
      pagamentos: dto.pagamento?.formasPagamento?.map((p) => ({
        aVista: true,
        meio: p.tipo,
        valor: p.valor,
      })) || [
        {
          aVista: true,
          meio: '01',
          valor: valorTotal,
        },
      ],
    };
  }

  /**
   * Retorna tributos padrão baseado no regime tributário
   */
  private getDefaultTributos(regimeTributario: number): any {
    // Regime Normal (3)
    if (regimeTributario === 3) {
      return {
        icms: {
          origem: '0',
          cst: '00',
          baseCalculo: {
            modalidadeDeterminacao: 0,
            valor: 0,
          },
          aliquota: 0,
          valor: 0,
        },
        pis: {
          cst: '99',
          baseCalculo: {
            valor: 0,
            quantidade: 0,
          },
          aliquota: 0,
          valor: 0,
        },
        cofins: {
          cst: '07',
          baseCalculo: {
            valor: 0,
          },
          aliquota: 0,
          valor: 0,
        },
      };
    }

    // Simples Nacional (1) ou Simples Excesso (2) - Padrão
    return {
      icms: {
        origem: '0',
        cst: '102',
      },
      pis: {
        cst: '08',
      },
      cofins: {
        cst: '08',
      },
    };
  }

  private buildTributosFromProduct(
    product: any,
    orderItem: any,
    regimeTributario: number = 1,
  ): any {
    const origem = String(product.origin || 0);

    // Regime Normal (3)
    if (regimeTributario === 3) {
      return {
        icms: {
          origem,
          cst: '00',
          baseCalculo: {
            modalidadeDeterminacao: 0,
            valor: 0,
          },
          aliquota: 0,
          valor: 0,
        },
        pis: {
          cst: '99',
          baseCalculo: {
            valor: 0,
            quantidade: 0,
          },
          aliquota: 0,
          valor: 0,
        },
        cofins: {
          cst: '07',
          baseCalculo: {
            valor: 0,
          },
          aliquota: 0,
          valor: 0,
        },
      };
    }

    // Simples Nacional (1) ou Simples Excesso (2) - Padrão
    return {
      icms: {
        origem,
        cst: '102', // Simples Nacional - Tributação sem permissão de crédito
      },
      pis: {
        cst: '08', // Outras operações de saída
      },
      cofins: {
        cst: '08', // Outras operações de saída
      },
    };
  }

  private buildPagamentosFromOrder(order: any): PlugNotasNFePagamento[] {
    if (!order.payments || order.payments.length === 0) {
      // Pagamento padrão se não houver pagamentos definidos
      return [
        {
          aVista: true,
          meio: '01', // Dinheiro como padrão
          valor: Number(order.total),
        },
      ];
    }

    return order.payments.map((payment: any) => {
      // Mapeia método de pagamento para código PlugNotas
      let meio = '99'; // Outros como padrão

      const methodName = payment.tenantPaymentMethod?.name?.toLowerCase() || '';

      if (methodName.includes('dinheiro')) meio = '01';
      else if (methodName.includes('cheque')) meio = '02';
      else if (methodName.includes('cartão') || methodName.includes('cartao')) {
        if (methodName.includes('débito') || methodName.includes('debito')) {
          meio = '04'; // Cartão de Débito
        } else {
          meio = '03'; // Cartão de Crédito
        }
      } else if (methodName.includes('boleto')) meio = '15';
      else if (methodName.includes('pix')) meio = '17';
      else if (
        methodName.includes('transferência') ||
        methodName.includes('transferencia')
      ) {
        meio = '18'; // Transferência Bancária
      }

      return {
        aVista: true,
        meio,
        valor: Number(payment.finalAmount),
      };
    });
  }

  private async saveNFeRecord(
    tenantId: string,
    data: {
      idIntegracao: string;
      plugnotasId?: string;
      orderId?: string;
      status: string;
      chaveAcesso?: string;
      numero?: number;
      serie?: number;
      protocolo?: string;
      destinatarioDoc?: string;
      destinatarioNome?: string;
      valorTotal: number;
      naturezaOperacao: string;
      userId: string;
    },
  ): Promise<void> {
    await this.prisma.nfeEmitida.create({
      data: {
        tenantId,
        idIntegracao: data.idIntegracao,
        plugnotasId: data.plugnotasId,
        orderId: data.orderId,
        status: data.status,
        chaveAcesso: data.chaveAcesso,
        numero: data.numero,
        serie: data.serie,
        protocolo: data.protocolo,
        destinatarioDocumento: data.destinatarioDoc,
        destinatarioNome: data.destinatarioNome,
        valorTotal: data.valorTotal,
        naturezaOperacao: data.naturezaOperacao,
        userId: data.userId,
      },
    });
  }
}
