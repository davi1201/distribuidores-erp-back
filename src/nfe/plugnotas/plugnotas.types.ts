/**
 * PlugNotas API Types
 * Baseado na documentação oficial: https://docs.plugnotas.com.br
 */

// ==================== EMPRESA ====================

export interface PlugNotasEndereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  codigoCidade: string; // Código IBGE
  descricaoCidade: string;
  estado: string; // UF
  cep: string;
  tipoBairro?: string;
  tipoLogradouro?: string;
  codigoPais?: string;
  descricaoPais?: string;
  telefone?: string;
}

export interface PlugNotasEmpresa {
  cpfCnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  regimeTributario?: number; // 1=Simples Nacional, 2=Simples Excesso, 3=Regime Normal
  email?: string;
  telefone?: string;
  endereco: PlugNotasEndereco;
  nfeConfig?: {
    ambiente: number; // 1=Produção, 2=Homologação
    danfeImprimeNomeFantasia?: boolean;
  };
}

// ==================== NFE ====================

export interface PlugNotasNFeDestinatario {
  cpfCnpj: string;
  razaoSocial: string;
  email?: string;
  inscricaoEstadual?: string;
  indicadorInscricaoEstadual?: number; // 1=Contribuinte, 2=Isento, 9=Não contribuinte
  endereco?: PlugNotasEndereco;
}

// ICMS para Simples Nacional
export interface PlugNotasNFeICMSSimplesNacional {
  origem: string; // "0"=Nacional
  cst: string; // "102" para Simples Nacional
}

// ICMS para Regime Normal
export interface PlugNotasNFeICMSRegimeNormal {
  origem: string;
  cst: string; // "00", "10", "20", etc.
  baseCalculo?: {
    modalidadeDeterminacao?: number;
    valor: number;
  };
  aliquota?: number;
  valor?: number;
}

// PIS para Simples Nacional
export interface PlugNotasNFePISSimplesNacional {
  cst: string; // "08"
}

// PIS para Regime Normal
export interface PlugNotasNFePISRegimeNormal {
  cst: string; // "99", "01", etc.
  baseCalculo?: {
    valor: number;
    quantidade?: number;
  };
  aliquota?: number;
  valor?: number;
}

// COFINS para Simples Nacional
export interface PlugNotasNFeCOFINSSimplesNacional {
  cst: string; // "08"
}

// COFINS para Regime Normal
export interface PlugNotasNFeCOFINSRegimeNormal {
  cst: string; // "07", "99", etc.
  baseCalculo?: {
    valor: number;
  };
  aliquota?: number;
  valor?: number;
}

// Tributos genéricos (flexível para qualquer regime)
export interface PlugNotasNFeTributos {
  icms: any;
  pis: any;
  cofins: any;
  ipi?: any;
  is?: any; // Para reforma tributária
  ibscbs?: any; // Para reforma tributária
}

// Alias para compatibilidade
export type PlugNotasNFeImpostos = PlugNotasNFeTributos;

export interface PlugNotasNFeItem {
  codigo: string;
  descricao: string;
  ncm: string;
  cest?: string;
  cfop: string;
  unidade?: string; // Unidade de medida
  quantidade?: number;
  valorUnitario: {
    comercial: number;
    tributavel?: number;
  };
  valor: number; // Valor total do item
  informacoesAdicionais?: string;
  codigoBarras?: string;
  tributos: any; // Flexível para diferentes regimes tributários
}

export interface PlugNotasNFePagamento {
  aVista?: boolean;
  meio: string; // 01=Dinheiro, 02=Cheque, 03=Cartão Crédito, etc.
  valor: number;
}

export interface PlugNotasNFeTransporte {
  modalidadeFrete?: number; // 0=Emitente, 1=Destinatário, 2=Terceiros, 9=Sem Frete
  transportador?: {
    cpfCnpj?: string;
    razaoSocial?: string;
    inscricaoEstadual?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
  };
  volumes?: Array<{
    quantidade?: number;
    especie?: string;
    marca?: string;
    numeracao?: string;
    pesoLiquido?: number;
    pesoBruto?: number;
  }>;
}

export interface PlugNotasNFe {
  idIntegracao: string; // ID único para rastreamento
  presencial?: string; // "0"=Não se aplica, "1"=Presencial, "2"=Internet, etc.
  natureza: string; // Ex: "VENDA DE MERCADORIA"
  finalidade?: number; // 1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução
  consumidorFinal?: boolean;
  emitente: {
    cpfCnpj: string;
  };
  destinatario: PlugNotasNFeDestinatario;
  itens: PlugNotasNFeItem[];
  pagamentos: PlugNotasNFePagamento[];
  transporte?: PlugNotasNFeTransporte;
  informacoesAdicionais?: string;
  responsavelTecnico?: {
    cpfCnpj: string;
    nome: string;
    email: string;
    telefone?: {
      ddd: string;
      numero: string;
    };
  };
}

// ==================== CERTIFICADO ====================

export interface PlugNotasCertificadoUpload {
  arquivo: string; // Base64 do arquivo .pfx
  senha: string;
  cpfCnpj: string;
}

export interface PlugNotasCertificadoResponse {
  cpfCnpj: string;
  razaoSocial: string;
  dataValidade: string;
  status: string;
}

// ==================== RESPOSTAS ====================

export interface PlugNotasNFeResponse {
  id: string;
  idIntegracao: string;
  status: PlugNotasNFeStatus;
  chaveAcesso?: string;
  numero?: number;
  serie?: number;
  protocolo?: string;
  dataAutorizacao?: string;
  motivo?: string;
  mensagem?: string;
  xml?: string;
}

export type PlugNotasNFeStatus =
  | 'PROCESSANDO'
  | 'AUTORIZADO'
  | 'REJEITADO'
  | 'CANCELADO'
  | 'DENEGADO'
  | 'ERRO';

export interface PlugNotasConsultaResponse {
  documentos: PlugNotasNFeResponse[];
  paginacao: {
    pagina: number;
    totalPaginas: number;
    totalItens: number;
  };
}

export interface PlugNotasCancelamentoRequest {
  idIntegracao: string;
  justificativa: string; // Mínimo 15 caracteres
}

export interface PlugNotasCancelamentoResponse {
  id: string;
  idIntegracao: string;
  status: string;
  protocolo?: string;
  dataEvento?: string;
  motivo?: string;
}

export interface PlugNotasCartaCorrecaoRequest {
  idIntegracao: string;
  correcao: string; // Mínimo 15 caracteres
}

export interface PlugNotasCartaCorrecaoResponse {
  id: string;
  idIntegracao: string;
  sequencia: number;
  protocolo?: string;
  dataEvento?: string;
  status: string;
}

export interface PlugNotasError {
  codigo: string;
  mensagem: string;
  campo?: string;
}

export interface PlugNotasApiResponse<T = any> {
  data?: T;
  error?: PlugNotasError;
  message?: string;
}

// ==================== INUTILIZAÇÃO ====================

export interface PlugNotasInutilizacaoRequest {
  cpfCnpj: string;
  serie: number;
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string;
  ambiente?: number;
}

export interface PlugNotasInutilizacaoResponse {
  id: string;
  status: string;
  protocolo?: string;
  motivo?: string;
}
