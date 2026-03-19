import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsEnum,
  MinLength,
  IsNotEmpty,
  Min,
  Max,
  IsInt,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// ==================== ENUMS ====================

export enum AmbienteNFe {
  PRODUCAO = 1,
  HOMOLOGACAO = 2,
}

export enum RegimeTributario {
  SIMPLES_NACIONAL = 1,
  SIMPLES_EXCESSO = 2,
  REGIME_NORMAL = 3,
}

export enum FinalidadeNFe {
  NORMAL = 1,
  COMPLEMENTAR = 2,
  AJUSTE = 3,
  DEVOLUCAO = 4,
}

export enum PresencaComprador {
  NAO_SE_APLICA = 0,
  PRESENCIAL = 1,
  INTERNET = 2,
  TELEMARKETING = 3,
  ENTREGA_DOMICILIO = 4,
  PRESENCIAL_FORA = 5,
  OUTROS = 9,
}

export enum ModalidadeFrete {
  EMITENTE = 0,
  DESTINATARIO = 1,
  TERCEIROS = 2,
  SEM_FRETE = 9,
}

export enum IndicadorIE {
  CONTRIBUINTE = 1,
  ISENTO = 2,
  NAO_CONTRIBUINTE = 9,
}

export enum FormaPagamento {
  DINHEIRO = '01',
  CHEQUE = '02',
  CARTAO_CREDITO = '03',
  CARTAO_DEBITO = '04',
  CREDITO_LOJA = '05',
  VALE_ALIMENTACAO = '10',
  VALE_REFEICAO = '11',
  VALE_PRESENTE = '12',
  VALE_COMBUSTIVEL = '13',
  BOLETO = '15',
  DEPOSITO = '16',
  PIX = '17',
  TRANSFERENCIA = '18',
  SEM_PAGAMENTO = '90',
  OUTROS = '99',
}

// ==================== EMPRESA DTOs ====================

export class EnderecoDto {
  @IsString()
  @IsNotEmpty()
  logradouro: string;

  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsOptional()
  @IsString()
  complemento?: string;

  @IsString()
  @IsNotEmpty()
  bairro: string;

  @IsString()
  @IsNotEmpty()
  codigoCidade: string; // IBGE

  @IsString()
  @IsNotEmpty()
  descricaoCidade: string;

  @IsString()
  @MinLength(2)
  estado: string;

  @IsString()
  @IsNotEmpty()
  cep: string;

  @IsOptional()
  @IsString()
  telefone?: string;
}

export class CreateEmpresaPlugNotasDto {
  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @IsString()
  @IsNotEmpty()
  razaoSocial: string;

  @IsOptional()
  @IsString()
  nomeFantasia?: string;

  @IsOptional()
  @IsString()
  inscricaoEstadual?: string;

  @IsOptional()
  @IsString()
  inscricaoMunicipal?: string;

  @IsOptional()
  @IsEnum(RegimeTributario)
  regimeTributario?: RegimeTributario;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco: EnderecoDto;

  @IsOptional()
  @IsEnum(AmbienteNFe)
  ambiente?: AmbienteNFe;
}

// ==================== CERTIFICADO DTOs ====================

export class UploadCertificadoDto {
  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @IsString()
  @IsNotEmpty()
  senha: string;

  // O arquivo será enviado como multipart/form-data
}

// ==================== NFE DTOs ====================

export class ImpostosICMSDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  origem?: number;

  @IsOptional()
  @IsString()
  cst?: string;

  @IsOptional()
  @IsString()
  csosn?: string;

  @IsOptional()
  @IsNumber()
  aliquota?: number;

  @IsOptional()
  @IsNumber()
  baseCalculo?: number;

  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsNumber()
  reducaoBaseCalculo?: number;
}

export class ImpostosPISDto {
  @IsString()
  @IsNotEmpty()
  cst: string;

  @IsOptional()
  @IsNumber()
  baseCalculo?: number;

  @IsOptional()
  @IsNumber()
  aliquota?: number;

  @IsOptional()
  @IsNumber()
  valor?: number;
}

export class ImpostosCOFINSDto {
  @IsString()
  @IsNotEmpty()
  cst: string;

  @IsOptional()
  @IsNumber()
  baseCalculo?: number;

  @IsOptional()
  @IsNumber()
  aliquota?: number;

  @IsOptional()
  @IsNumber()
  valor?: number;
}

export class ImpostosIPIDto {
  @IsOptional()
  @IsString()
  cst?: string;

  @IsOptional()
  @IsString()
  codigoEnquadramento?: string;

  @IsOptional()
  @IsNumber()
  baseCalculo?: number;

  @IsOptional()
  @IsNumber()
  aliquota?: number;

  @IsOptional()
  @IsNumber()
  valor?: number;
}

export class TributosItemDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ImpostosICMSDto)
  icms?: ImpostosICMSDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImpostosPISDto)
  pis?: ImpostosPISDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImpostosCOFINSDto)
  cofins?: ImpostosCOFINSDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImpostosIPIDto)
  ipi?: ImpostosIPIDto;
}

// Alias para compatibilidade
export { TributosItemDto as ImpostosItemDto };

export class ItemNFeDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsString()
  @IsNotEmpty()
  ncm: string;

  @IsOptional()
  @IsString()
  cest?: string;

  @IsString()
  @IsNotEmpty()
  cfop: string;

  @IsString()
  @IsNotEmpty()
  unidadeComercial: string;

  @IsNumber()
  @Min(0.0001)
  quantidadeComercial: number;

  @IsNumber()
  @Min(0)
  valorUnitarioComercial: number;

  @IsOptional()
  @IsNumber()
  valorTotal?: number;

  @IsOptional()
  @IsString()
  codigoBarras?: string;

  @IsOptional()
  @IsString()
  informacoesAdicionais?: string;

  @ValidateNested()
  @Type(() => TributosItemDto)
  tributos: TributosItemDto;
}

export class DestinatarioDto {
  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @IsString()
  @IsNotEmpty()
  razaoSocial: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  inscricaoEstadual?: string;

  @IsOptional()
  @IsEnum(IndicadorIE)
  indicadorInscricaoEstadual?: IndicadorIE;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto;
}

export class FormaPagamentoDto {
  @IsEnum(FormaPagamento)
  tipo: FormaPagamento;

  @IsNumber()
  @Min(0)
  valor: number;

  @IsOptional()
  @IsString()
  descricao?: string;
}

export class PagamentoDto {
  @IsOptional()
  @IsInt()
  indicadorFormaPagamento?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormaPagamentoDto)
  formasPagamento: FormaPagamentoDto[];
}

export class VolumeDto {
  @IsOptional()
  @IsNumber()
  quantidade?: number;

  @IsOptional()
  @IsString()
  especie?: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsNumber()
  pesoLiquido?: number;

  @IsOptional()
  @IsNumber()
  pesoBruto?: number;
}

export class TransportadorDto {
  @IsOptional()
  @IsString()
  cpfCnpj?: string;

  @IsOptional()
  @IsString()
  razaoSocial?: string;

  @IsOptional()
  @IsString()
  inscricaoEstadual?: string;

  @IsOptional()
  @IsString()
  endereco?: string;

  @IsOptional()
  @IsString()
  cidade?: string;

  @IsOptional()
  @IsString()
  uf?: string;
}

export class TransporteDto {
  @IsOptional()
  @IsEnum(ModalidadeFrete)
  modalidadeFrete?: ModalidadeFrete;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransportadorDto)
  transportador?: TransportadorDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VolumeDto)
  volumes?: VolumeDto[];
}

export class EmitirNFeDto {
  @IsOptional()
  @IsString()
  idIntegracao?: string; // Se não fornecido, será gerado automaticamente

  @IsString()
  @IsNotEmpty()
  naturezaOperacao: string;

  @IsOptional()
  @IsEnum(FinalidadeNFe)
  finalidade?: FinalidadeNFe;

  @IsOptional()
  @IsEnum(PresencaComprador)
  presencaComprador?: PresencaComprador;

  @IsOptional()
  @IsBoolean()
  consumidorFinal?: boolean;

  @ValidateNested()
  @Type(() => DestinatarioDto)
  destinatario: DestinatarioDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemNFeDto)
  itens: ItemNFeDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PagamentoDto)
  pagamento?: PagamentoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransporteDto)
  transporte?: TransporteDto;

  @IsOptional()
  @IsString()
  informacoesAdicionais?: string;

  // Campos para vinculação interna
  @IsOptional()
  @IsString()
  orderId?: string;
}

// ==================== CANCELAMENTO DTOs ====================

export class CancelarNFeDto {
  @IsString()
  @IsNotEmpty()
  idIntegracao: string;

  @IsString()
  @MinLength(15, { message: 'Justificativa deve ter no mínimo 15 caracteres' })
  justificativa: string;
}

// ==================== CARTA DE CORREÇÃO DTOs ====================

export class CartaCorrecaoDto {
  @IsString()
  @IsNotEmpty()
  idIntegracao: string;

  @IsString()
  @MinLength(15, { message: 'Correção deve ter no mínimo 15 caracteres' })
  correcao: string;
}

// ==================== INUTILIZAÇÃO DTOs ====================

export class InutilizarNumeracaoDto {
  @IsInt()
  @Min(1)
  serie: number;

  @IsInt()
  @Min(1)
  numeroInicial: number;

  @IsInt()
  @Min(1)
  numeroFinal: number;

  @IsString()
  @MinLength(15, { message: 'Justificativa deve ter no mínimo 15 caracteres' })
  justificativa: string;
}

// ==================== CONSULTA DTOs ====================

export class ConsultarNFeDto {
  @IsOptional()
  @IsString()
  idIntegracao?: string;

  @IsOptional()
  @IsString()
  chaveAcesso?: string;
}

export class ListarNFeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  dataInicio?: string;

  @IsOptional()
  @IsString()
  dataFim?: string;
}

// ==================== EMISSÃO A PARTIR DE PEDIDO ====================

export class EmitirNFeFromOrderDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsOptional()
  @IsString()
  naturezaOperacao?: string;

  @IsOptional()
  @IsString()
  informacoesAdicionais?: string;
}
