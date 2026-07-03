const ACCENT_MAP: Record<string, string> = {
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ç: 'c',
};

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSearchQuery(value?: string) {
  if (!value?.trim()) {
    return [];
  }

  return normalizeSearchText(value)
    .split(' ')
    .filter((token) => token.length >= 1)
    .slice(0, 8);
}

export function matchesSearchTokens(
  haystackParts: Array<string | null | undefined>,
  tokens: string[],
) {
  if (tokens.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText(haystackParts.filter(Boolean).join(' '));
  return tokens.every((token) => haystack.includes(token));
}

export function sanitizeSearchTerm(value?: string) {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export function expandAccentInsensitive(token: string) {
  return token
    .split('')
    .map((char) => ACCENT_MAP[char] ?? char)
    .join('');
}
