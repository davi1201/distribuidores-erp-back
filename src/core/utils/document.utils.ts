// ============================================================================
// UTILITÁRIOS DE DOCUMENTOS (CPF, CNPJ, etc)
// ============================================================================

/**
 * Tipo de documento
 */
export enum DocumentType {
  CPF = 'CPF',
  CNPJ = 'CNPJ',
}

/**
 * Remove formatação de documento (pontos, traços, barras)
 */
export function cleanDocument(doc: string | number): string {
  return String(doc).replace(/[^\d]/g, '');
}

/**
 * Detecta tipo de documento baseado no tamanho
 */
export function detectDocumentType(doc: string): DocumentType {
  const cleaned = cleanDocument(doc);
  return cleaned.length === 11 ? DocumentType.CPF : DocumentType.CNPJ;
}

/**
 * Formata CPF: 123.456.789-01
 */
export function formatCPF(cpf: string): string {
  const cleaned = cleanDocument(cpf);
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata CNPJ: 12.345.678/0001-90
 */
export function formatCNPJ(cnpj: string): string {
  const cleaned = cleanDocument(cnpj);
  return cleaned.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
    '$1.$2.$3/$4-$5',
  );
}

/**
 * Formata documento automaticamente (CPF ou CNPJ)
 */
export function formatDocument(doc: string): string {
  const cleaned = cleanDocument(doc);
  return cleaned.length === 11 ? formatCPF(cleaned) : formatCNPJ(cleaned);
}

/**
 * Valida CPF
 */
export function isValidCPF(cpf: string): boolean {
  const cleaned = cleanDocument(cpf);

  if (cleaned.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;

  return remainder === parseInt(cleaned.charAt(10));
}

/**
 * Valida CNPJ
 */
export function isValidCNPJ(cnpj: string): boolean {
  const cleaned = cleanDocument(cnpj);

  if (cleaned.length !== 14) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned.charAt(i)) * weights1[i];
  }
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== parseInt(cleaned.charAt(12))) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleaned.charAt(i)) * weights2[i];
  }
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;

  return digit2 === parseInt(cleaned.charAt(13));
}

/**
 * Valida documento (CPF ou CNPJ)
 */
export function isValidDocument(doc: string): boolean {
  const cleaned = cleanDocument(doc);
  return cleaned.length === 11 ? isValidCPF(cleaned) : isValidCNPJ(cleaned);
}
