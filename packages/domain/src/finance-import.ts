export type SupportedBank = "BANCOLOMBIA" | "DAVIVIENDA";

export interface ParsedBankRow {
  accountRef: string;
  amountMinor: number;
  currency: string;
  reference: string | null;
  transactionAt: Date;
  raw: Record<string, string>;
}

export function parseAmountToMinor(value: string): number {
  const cleaned = value.trim().replace(/[$\s]/g, "");
  if (cleaned.length === 0 || !/^[\d.,]+$/.test(cleaned)) {
    throw new Error(`Invalid amount "${value}".`);
  }
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const decimals = cleaned.length - lastComma - 1;
    normalized =
      decimals >= 1 && decimals <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals >= 1 && decimals <= 2 ? cleaned : cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }
  const major = Number(normalized);
  if (!Number.isFinite(major)) {
    throw new Error(`Invalid amount "${value}".`);
  }
  return Math.round(major * 100);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }
  const headers = splitCsvLine(lines[0] ?? "").map((header) => header.toLowerCase());
  const rows = (lines.slice(1) as string[]).map((line) => {
    const cells = splitCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
  return { headers, rows };
}

function requireColumn(headers: string[], name: string, bank: string): void {
  if (!headers.includes(name)) {
    throw new Error(`Missing column "${name}" in ${bank} CSV.`);
  }
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match?.[1] && match[2]) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (dayFirst?.[1] && dayFirst[2] && dayFirst[3]) {
    return new Date(Date.UTC(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1])));
  }
  throw new Error(`Invalid date "${value}". Expected YYYY-MM-DD or DD/MM/YYYY.`);
}

export function parseBankCsv(bank: SupportedBank, csv: string): ParsedBankRow[] {
  const { headers, rows } = parseCsv(csv);
  if (bank === "BANCOLOMBIA") {
    for (const column of ["fecha", "descripcion", "valor", "cuenta"]) {
      requireColumn(headers, column, bank);
    }
    return rows.map((row) => ({
      accountRef: row["cuenta"] ?? "",
      amountMinor: parseAmountToMinor(row["valor"] ?? ""),
      currency: "COP",
      reference: row["descripcion"]?.length ? (row["descripcion"] as string) : null,
      transactionAt: parseDateOnly(row["fecha"] ?? ""),
      raw: row,
    }));
  }
  for (const column of ["fecha", "descripcion", "debito", "credito", "cuenta"]) {
    requireColumn(headers, column, bank);
  }
  return rows.map((row) => {
    const debit =
      (row["debito"] ?? "").trim().length > 0 ? parseAmountToMinor(row["debito"] ?? "0") : 0;
    const credit =
      (row["credito"] ?? "").trim().length > 0 ? parseAmountToMinor(row["credito"] ?? "0") : 0;
    return {
      accountRef: row["cuenta"] ?? "",
      amountMinor: credit - debit,
      currency: "COP",
      reference: row["descripcion"]?.length ? (row["descripcion"] as string) : null,
      transactionAt: parseDateOnly(row["fecha"] ?? ""),
      raw: row,
    };
  });
}

export function dedupeKey(
  bank: string,
  row: Pick<ParsedBankRow, "accountRef" | "amountMinor" | "reference" | "transactionAt">,
): string {
  const date = row.transactionAt.toISOString().slice(0, 10);
  return `${bank}|${row.accountRef}|${date}|${row.amountMinor}|${row.reference ?? ""}`;
}

export interface ImportDecision {
  toCreate: ParsedBankRow[];
  quarantined: ParsedBankRow[];
}

export function decideImport(rows: ParsedBankRow[]): ImportDecision {
  const groups = new Map<string, ParsedBankRow[]>();
  for (const row of rows) {
    const date = row.transactionAt.toISOString().slice(0, 10);
    const key = `${row.accountRef}|${date}|${row.reference ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const toCreate: ParsedBankRow[] = [];
  const quarantined: ParsedBankRow[] = [];
  for (const group of groups.values()) {
    const amounts = new Set(group.map((row) => row.amountMinor));
    if (amounts.size > 1) {
      quarantined.push(...group);
    } else {
      toCreate.push(...group);
    }
  }
  return { toCreate, quarantined };
}

export interface MatchCandidate {
  id: string;
  amountMinor: number;
  paidAt: string;
  reference: string | null;
}

export interface MatchSuggestion extends MatchCandidate {
  score: number;
}

export function suggestMatches(
  bankTx: { amountMinor: number; transactionAt: Date; reference: string | null },
  candidates: MatchCandidate[],
  limit = 5,
): MatchSuggestion[] {
  const scored: MatchSuggestion[] = [];
  for (const candidate of candidates) {
    let score = 0;
    if (candidate.amountMinor === bankTx.amountMinor) {
      score += 50;
    } else if (Math.abs(candidate.amountMinor - bankTx.amountMinor) <= 100) {
      score += 20;
    } else {
      continue;
    }
    const daysApart =
      Math.abs(Date.parse(candidate.paidAt) - bankTx.transactionAt.getTime()) / 86_400_000;
    if (Number.isNaN(daysApart) || daysApart > 7) {
      continue;
    }
    score += Math.max(0, 30 - Math.floor(daysApart) * 10);
    const ref = (bankTx.reference ?? "").toLowerCase();
    const candidateRef = (candidate.reference ?? "").toLowerCase();
    if (
      ref.length > 3 &&
      candidateRef.length > 3 &&
      (ref.includes(candidateRef) || candidateRef.includes(ref))
    ) {
      score += 20;
    }
    scored.push({ ...candidate, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
