// ============================================================================
// UTILITÁRIOS DE STRING
// ============================================================================

/**
 * Normaliza string removendo acentos e convertendo para minúsculas
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Remove caracteres especiais mantendo apenas letras e números
 */
export function removeSpecialChars(str: string): string {
  return str.replace(/[^\p{L}0-9\s]/gu, '');
}

/**
 * Limpa nome de produto removendo medidas e números
 */
export function cleanProductName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+-\s+/g, ' ')
    .replace(/\b\d+([.,]\d+)?\s*(ML|L|G|KG|MG|M|MM|CM|UN|PC|CX)\b/gi, '')
    .replace(/\d+/g, '')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai nome da variante a partir do nome completo e nome do pai
 */
export function extractVariantName(
  fullName: string,
  parentName: string,
): string | null {
  const full = removeSpecialChars(fullName.toUpperCase());
  const parent = removeSpecialChars(parentName.toUpperCase());

  const variantParts = full.split(' ').filter((word) => !parent.includes(word));

  return variantParts.length > 0 ? variantParts.join(' ') : null;
}

/**
 * Gera slug a partir de texto
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

/**
 * Capitaliza primeira letra de cada palavra
 */
export function capitalizeWords(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Trunca string com ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
