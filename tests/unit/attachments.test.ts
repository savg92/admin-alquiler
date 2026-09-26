import { describe, expect, test } from "bun:test";
import { MAX_ATTACHMENT_BYTES, validateAttachment } from "@admin-alquiler/domain";

const VALID = {
  kind: "PHOTO",
  storageKey: "org-a/prop-1/unit-101/front.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 512_000,
  unitId: "unit-1",
  capturedAt: "2026-02-01",
};

describe("validateAttachment", () => {
  test("accepts a valid photo with unit and capture date", () => {
    const result = validateAttachment(VALID);
    expect(result.kind).toBe("PHOTO");
    expect(result.unitId).toBe("unit-1");
    expect(result.capturedAt).toBeInstanceOf(Date);
  });

  test("unit and capture date are optional", () => {
    const result = validateAttachment({
      kind: "RECORD",
      storageKey: "org-a/prop-1/deed.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(result.unitId).toBeNull();
    expect(result.capturedAt).toBeNull();
  });

  test("rejects bad kind, unsafe keys, mime, size and dates", () => {
    expect(() => validateAttachment({ ...VALID, kind: "VIDEO" })).toThrow(/"kind"/);
    expect(() => validateAttachment({ ...VALID, storageKey: "../escape.jpg" })).toThrow(
      /storageKey/,
    );
    expect(() => validateAttachment({ ...VALID, storageKey: "a" })).toThrow(/storageKey/);
    expect(() => validateAttachment({ ...VALID, mimeType: "video/mp4" })).toThrow(/"mimeType"/);
    expect(() => validateAttachment({ ...VALID, sizeBytes: 0 })).toThrow(/"sizeBytes"/);
    expect(() => validateAttachment({ ...VALID, sizeBytes: MAX_ATTACHMENT_BYTES + 1 })).toThrow(
      /"sizeBytes"/,
    );
    expect(() => validateAttachment({ ...VALID, capturedAt: "not-a-date" })).toThrow(/capturedAt/);
  });
});
