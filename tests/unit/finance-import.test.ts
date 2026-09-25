import { describe, expect, test } from "bun:test";
import {
  decideImport,
  dedupeKey,
  parseAmountToMinor,
  parseBankCsv,
  suggestMatches,
} from "@admin-alquiler/domain";

const BANCOLOMBIA_CSV = `fecha,descripcion,valor,cuenta
2026-02-04,PAGO ARRIENDO 101,1800000,123-456
05/02/2026,PAGO ARRIENDO 102,"1.800.000",123-456`;

const DAVIVIENDA_CSV = `fecha,descripcion,debito,credito,cuenta
2026-02-04,TRANSFERENCIA,,1800000,789
2026-02-05,RETIRO CAJERO,200000,,789`;

describe("bank imports", () => {
  test("parses Bancolombia rows with Colombian number formats", () => {
    const rows = parseBankCsv("BANCOLOMBIA", BANCOLOMBIA_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.amountMinor).toBe(180000000);
    expect(rows[1]?.amountMinor).toBe(180000000);
    expect(rows[0]?.accountRef).toBe("123-456");
    expect(rows[0]?.transactionAt.toISOString().slice(0, 10)).toBe("2026-02-04");
  });

  test("parses Davivienda debit/credit columns", () => {
    const rows = parseBankCsv("DAVIVIENDA", DAVIVIENDA_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.amountMinor).toBe(180000000);
    expect(rows[1]?.amountMinor).toBe(-20000000);
  });

  test("rejects missing columns and bad amounts", () => {
    expect(() => parseBankCsv("BANCOLOMBIA", "fecha,valor\n2026-02-04,100")).toThrow(
      /Missing column/,
    );
    expect(() => parseAmountToMinor("no-numero")).toThrow(/Invalid amount/);
  });

  test("dedupe keys are stable and conflict groups quarantine", () => {
    const rows = parseBankCsv("BANCOLOMBIA", BANCOLOMBIA_CSV);
    const first = rows[0];
    const second = rows[1];
    if (!first || !second) {
      throw new Error("test setup failed");
    }
    expect(dedupeKey("BANCOLOMBIA", first)).toBe(dedupeKey("BANCOLOMBIA", first));
    const conflict = { ...second, amountMinor: 170000000 };
    const decision = decideImport([first, second, conflict]);
    expect(decision.toCreate).toHaveLength(1);
    expect(decision.quarantined).toHaveLength(2);
  });

  test("match suggestions rank exact amount and close dates first", () => {
    const suggestions = suggestMatches(
      {
        amountMinor: 180000000,
        transactionAt: new Date("2026-02-04"),
        reference: "PAGO ARRIENDO 101",
      },
      [
        { id: "old", amountMinor: 180000000, paidAt: "2026-01-04", reference: "PAY" },
        { id: "near", amountMinor: 180000000, paidAt: "2026-02-05", reference: "ARRIENDO 101" },
        { id: "far-amount", amountMinor: 50000000, paidAt: "2026-02-04", reference: "ARRIENDO" },
      ],
    );
    expect(suggestions.map((item) => item.id)).toEqual(["near"]);
  });
});
