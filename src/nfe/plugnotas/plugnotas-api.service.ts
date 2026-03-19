import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  PlugNotasNFe,
  PlugNotasNFeResponse,
  PlugNotasEmpresa,
  PlugNotasCertificadoResponse,
  PlugNotasCancelamentoRequest,
  PlugNotasCancelamentoResponse,
  PlugNotasCartaCorrecaoRequest,
  PlugNotasCartaCorrecaoResponse,
  PlugNotasInutilizacaoRequest,
  PlugNotasInutilizacaoResponse,
  PlugNotasConsultaResponse,
} from './plugnotas.types';

export interface PlugNotasConfig {
  apiKey: string;
  baseUrl: string;
  ambiente: 'sandbox' | 'producao';
}

@Injectable()
export class PlugNotasApiService {
  private readonly logger = new Logger(PlugNotasApiService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // URLs base
    const ambiente = this.configService.get<string>('PLUGNOTAS_AMBIENTE');
    this.baseUrl =
      ambiente === 'producao'
        ? 'https://api.plugnotas.com.br'
        : 'https://api.sandbox.plugnotas.com.br';

    const apiKey = this.configService.get<string>('PLUGNOTAS_API_KEY');

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
      },
    });

    // Interceptor para logging
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.logger.error(
          `PlugNotas API Error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
        );
        return Promise.reject(error);
      },
    );
  }

  /**
   * Cria um cliente HTTP com API Key específica do tenant
   */
  createClientForTenant(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });
  }

  // ==================== EMPRESA ====================

  /**
   * Cadastra uma empresa emitente no PlugNotas
   */
  async cadastrarEmpresa(
    empresa: PlugNotasEmpresa,
    apiKey?: string,
  ): Promise<any> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.post('/empresa', empresa);
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'cadastrar empresa');
    }
  }

  /**
   * Consulta uma empresa pelo CNPJ
   */
  async consultarEmpresa(cpfCnpj: string, apiKey?: string): Promise<any> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.get(
        `/empresa/${this.formatDocument(cpfCnpj)}`,
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.handlePlugNotasError(error, 'consultar empresa');
    }
  }

  /**
   * Atualiza uma empresa
   */
  async atualizarEmpresa(
    cpfCnpj: string,
    empresa: Partial<PlugNotasEmpresa>,
    apiKey?: string,
  ): Promise<any> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.patch(
        `/empresa/${this.formatDocument(cpfCnpj)}`,
        empresa,
      );
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'atualizar empresa');
    }
  }

  // ==================== CERTIFICADO ====================

  /**
   * Envia certificado digital A1 (base64)
   */
  async enviarCertificado(
    cpfCnpj: string,
    arquivoBase64: string,
    senha: string,
    apiKey?: string,
  ): Promise<PlugNotasCertificadoResponse> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.post('/certificado', {
        arquivo: arquivoBase64,
        senha,
        cpfCnpj: this.formatDocument(cpfCnpj),
      });
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'enviar certificado');
    }
  }

  /**
   * Consulta status do certificado
   */
  async consultarCertificado(
    cpfCnpj: string,
    apiKey?: string,
  ): Promise<PlugNotasCertificadoResponse | null> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.get(
        `/certificado/${this.formatDocument(cpfCnpj)}`,
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.handlePlugNotasError(error, 'consultar certificado');
    }
  }

  // ==================== NFE ====================

  /**
   * Emite uma NF-e
   * A API do PlugNotas espera um array de documentos
   */
  async emitirNFe(
    nfe: PlugNotasNFe,
    apiKey?: string,
  ): Promise<PlugNotasNFeResponse> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;

      // A API do PlugNotas espera um array de documentos
      const payload = [nfe];
      this.logger.debug(
        `Enviando NFe para PlugNotas: ${JSON.stringify(payload, null, 2)}`,
      );

      const response = await client.post('/nfe', payload);
      this.logger.debug(`Resposta PlugNotas: ${JSON.stringify(response.data)}`);

      // A resposta vem como { documents: [...], message: "...", protocol: "..." }
      const data = response.data;
      const doc = data.documents?.[0] || {};

      return {
        id: doc.id,
        idIntegracao: doc.idIntegracao || nfe.idIntegracao,
        status: 'PROCESSANDO', // Status inicial é sempre PROCESSANDO
        protocolo: data.protocol,
        mensagem: data.message,
      };
    } catch (error) {
      this.handlePlugNotasError(error, 'emitir NFe');
    }
  }

  /**
   * Consulta status de uma NF-e pelo ID de integração
   * Nota: pode retornar 404 se a nota ainda estiver em processamento inicial
   */
  async consultarNFe(
    idIntegracao: string,
    apiKey?: string,
  ): Promise<PlugNotasNFeResponse | null> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.get(`/nfe/${idIntegracao}`);

      // A resposta pode vir como array ou objeto
      const data = response.data;
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // Nota ainda em processamento - retorna null ao invés de erro
        return null;
      }
      this.handlePlugNotasError(error, 'consultar NFe');
    }
  }

  /**
   * Consulta resumo de uma NF-e pelo protocolo
   * Endpoint: /nfe/{protocolo}/resumo
   */
  async consultarNFeResumo(
    protocolo: string,
    apiKey?: string,
  ): Promise<any | null> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;

      this.logger.debug(`Consultando NFe resumo: /nfe/${protocolo}/resumo`);
      const response = await client.get(`/nfe/${protocolo}/resumo`);

      // A resposta vem como array
      const data = response.data;
      this.logger.debug(`Resposta consultarNFeResumo: ${JSON.stringify(data)}`);

      if (Array.isArray(data) && data.length > 0) {
        const nfe = data[0];
        // Mapeia para o formato padrão
        const result = {
          id: nfe.id,
          idIntegracao: nfe.idIntegracao,
          status: nfe.status === 'CONCLUIDO' ? 'AUTORIZADO' : nfe.status,
          numero: nfe.numero ? parseInt(nfe.numero) : undefined,
          chaveAcesso: nfe.chave,
          protocolo: nfe.protocolo,
          dataAutorizacao: nfe.dataAutorizacao,
          dataEmissao: nfe.emissao,
          valor: nfe.valor,
          mensagem: nfe.mensagem,
          urlXml: nfe.xml,
          urlPdf: nfe.pdf,
          cStat: nfe.cStat,
          emitente: nfe.emitente,
          destinatario: nfe.destinatario,
        };
        this.logger.debug(
          `NFe resumo mapeado: id=${result.id}, urlPdf=${result.urlPdf}, urlXml=${result.urlXml}`,
        );
        return result;
      }
      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.warn(`NFe não encontrada pelo protocolo: ${protocolo}`);
        return null;
      }
      this.handlePlugNotasError(error, 'consultar resumo NFe');
    }
  }

  /**
   * Lista NF-es
   */
  async listarNFes(
    params: {
      pagina?: number;
      limite?: number;
      status?: string;
      cpfCnpjEmitente?: string;
      dataInicio?: string;
      dataFim?: string;
    },
    apiKey?: string,
  ): Promise<PlugNotasConsultaResponse> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const queryParams = new URLSearchParams();

      if (params.pagina) queryParams.append('pagina', params.pagina.toString());
      if (params.limite) queryParams.append('limite', params.limite.toString());
      if (params.status) queryParams.append('status', params.status);
      if (params.cpfCnpjEmitente)
        queryParams.append('cpfCnpjEmitente', params.cpfCnpjEmitente);
      if (params.dataInicio)
        queryParams.append('dataInicio', params.dataInicio);
      if (params.dataFim) queryParams.append('dataFim', params.dataFim);

      const response = await client.get(`/nfe?${queryParams.toString()}`);
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'listar NFes');
    }
  }

  /**
   * Cancela uma NF-e
   */
  async cancelarNFe(
    data: PlugNotasCancelamentoRequest,
    apiKey?: string,
  ): Promise<PlugNotasCancelamentoResponse> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.post(`/nfe/${data.idIntegracao}/cancelar`, {
        justificativa: data.justificativa,
      });
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'cancelar NFe');
    }
  }

  /**
   * Emite carta de correção
   */
  async cartaCorrecao(
    data: PlugNotasCartaCorrecaoRequest,
    apiKey?: string,
  ): Promise<PlugNotasCartaCorrecaoResponse> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.post(
        `/nfe/${data.idIntegracao}/carta-correcao`,
        { correcao: data.correcao },
      );
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'emitir carta de correção');
    }
  }

  /**
   * Inutiliza numeração
   */
  async inutilizarNumeracao(
    data: PlugNotasInutilizacaoRequest,
    apiKey?: string,
  ): Promise<PlugNotasInutilizacaoResponse> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.post('/nfe/inutilizacao', data);
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'inutilizar numeração');
    }
  }

  // ==================== DOWNLOAD ====================

  /**
   * Download do PDF da NF-e
   */
  async downloadPDF(idIntegracao: string, apiKey?: string): Promise<Buffer> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.get(`/nfe/${idIntegracao}/pdf`, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data);
    } catch (error) {
      this.handlePlugNotasError(error, 'download PDF');
    }
  }

  /**
   * Download do XML da NF-e
   */
  async downloadXML(idIntegracao: string, apiKey?: string): Promise<string> {
    try {
      const client = apiKey
        ? this.createClientForTenant(apiKey)
        : this.httpClient;
      const response = await client.get(`/nfe/${idIntegracao}/xml`);
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'download XML');
    }
  }

  /**
   * Download direto de uma URL (para PDF)
   */
  async downloadFromUrl(url: string): Promise<Buffer> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data);
    } catch (error) {
      this.handlePlugNotasError(error, 'download de URL');
    }
  }

  /**
   * Download direto de uma URL (para XML/texto)
   */
  async downloadFromUrlText(url: string): Promise<string> {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      this.handlePlugNotasError(error, 'download de URL');
    }
  }

  // ==================== HELPERS ====================

  /**
   * Formata documento removendo caracteres especiais
   */
  private formatDocument(doc: string): string {
    return doc.replace(/[^\d]/g, '');
  }

  /**
   * Tratamento de erros da API
   */
  private handlePlugNotasError(error: any, operacao: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      this.logger.error(
        `Erro ao ${operacao}: Status ${status}, Response: ${JSON.stringify(data)}`,
      );

      if (status === 400) {
        const message = this.extractErrorMessage(data);
        throw new BadRequestException(
          message || `Erro de validação ao ${operacao}`,
        );
      }

      if (status === 401) {
        throw new BadRequestException('API Key inválida ou não autorizada');
      }

      if (status === 404) {
        throw new NotFoundException('Recurso não encontrado');
      }

      if (status === 422) {
        const message = this.extractErrorMessage(data);
        throw new BadRequestException(
          message || `Dados inválidos ao ${operacao}`,
        );
      }

      if (status === 429) {
        throw new BadRequestException(
          'Limite de requisições excedido. Tente novamente em alguns segundos.',
        );
      }
    }

    this.logger.error(`Erro inesperado ao ${operacao}: ${error.message}`);
    throw new InternalServerErrorException(`Erro ao ${operacao}`);
  }

  /**
   * Extrai mensagem de erro do response
   */
  private extractErrorMessage(data: any): string | null {
    if (!data) return null;

    // Formato padrão PlugNotas
    if (data.message) return data.message;
    if (data.mensagem) return data.mensagem;

    // Array de erros
    if (Array.isArray(data.errors)) {
      return data.errors.map((e: any) => e.message || e.mensagem).join('; ');
    }

    // Objeto de erro
    if (data.error) {
      if (typeof data.error === 'string') return data.error;
      return data.error.message || data.error.mensagem;
    }

    return null;
  }
}
