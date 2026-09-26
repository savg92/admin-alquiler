export interface TemplateDefinition {
  key: string;
  locale: string;
  subject?: string | null;
  body: string;
}

export function validateTemplate(definition: TemplateDefinition): void {
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(definition.key)) {
    throw new Error('Template key must be dotted lowercase, e.g. "dunning.day_7".');
  }
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(definition.locale)) {
    throw new Error('Template locale must look like "es-CO" or "en".');
  }
  if (definition.subject !== undefined && definition.subject !== null) {
    if (definition.subject.trim().length === 0 || definition.subject.length > 200) {
      throw new Error("Template subject must be 1-200 characters when present.");
    }
  }
  if (definition.body.trim().length === 0 || definition.body.length > 20000) {
    throw new Error("Template body must be 1-20000 characters.");
  }
}

export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      throw new Error(`Missing template variable "${name}".`);
    }
    return String(value);
  });
}

export function validateLocale(value: string): string {
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(value)) {
    throw new Error(`Unsupported locale "${value}".`);
  }
  return value;
}
