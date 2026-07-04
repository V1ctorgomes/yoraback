const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function extractTemplateVariables(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

export function renderTemplate(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(VARIABLE_PATTERN, (_, key: string) => {
    return variables[key] ?? '';
  });
}
