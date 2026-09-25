import { describe, expect, test } from "bun:test";
import {
  setupChecklist,
  tenancyPeriodsOverlap,
  validateBulkUnits,
  validateOwnershipShares,
} from "@admin-alquiler/domain";

describe("guided property setup", () => {
  test("bulk units require unique codes and valid subtypes", () => {
    expect(() =>
      validateBulkUnits([
        { code: "101", subtype: "RESIDENTIAL" },
        { code: "P1", subtype: "PARKING" },
      ]),
    ).not.toThrow();
    expect(() =>
      validateBulkUnits([
        { code: "101", subtype: "RESIDENTIAL" },
        { code: "101", subtype: "OFFICE" },
      ]),
    ).toThrow(/Duplicate unit code/);
    expect(() => validateBulkUnits([{ code: "101", subtype: "CASTLE" }])).toThrow(
      /Invalid unit subtype/,
    );
    expect(() => validateBulkUnits([])).toThrow(/At least one unit/);
  });

  test("ownership shares must total 100", () => {
    expect(() =>
      validateOwnershipShares([
        { ownerId: "a", sharePct: 70 },
        { ownerId: "b", sharePct: 30 },
      ]),
    ).not.toThrow();
    expect(() => validateOwnershipShares([{ ownerId: "a", sharePct: 60 }])).toThrow(/total 100/);
    expect(() => validateOwnershipShares([{ ownerId: "a", sharePct: 0 }])).toThrow(
      /greater than 0/,
    );
  });

  test("tenancy overlap detection", () => {
    expect(
      tenancyPeriodsOverlap(
        { startDate: "2026-01-01", endDate: "2026-12-31" },
        {
          startDate: "2026-06-01",
          endDate: null,
        },
      ),
    ).toBe(true);
    expect(
      tenancyPeriodsOverlap(
        { startDate: "2026-01-01", endDate: "2026-06-30" },
        {
          startDate: "2026-07-01",
          endDate: null,
        },
      ),
    ).toBe(false);
  });

  test("setup checklist tracks resumable progress", () => {
    expect(setupChecklist({ unitCount: 0, ownershipTotalPct: 0, tenancyCount: 0 }).complete).toBe(
      false,
    );
    const done = setupChecklist({ unitCount: 3, ownershipTotalPct: 100, tenancyCount: 1 });
    expect(done).toEqual({
      details: true,
      units: true,
      owners: true,
      tenants: true,
      complete: true,
    });
  });
});
