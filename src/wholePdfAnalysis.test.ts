import { expect, it, vi, beforeEach } from "vitest";
import type { AnalysisDocument } from "../shared/analysis";
import { supplementWholePdfs } from "./wholePdfAnalysis";
import { loadPdfSource } from "./pdfSource";
import { generatePdfDetails } from "./generatePdfDetails";
vi.mock("./pdfSource", () => ({ loadPdfSource: vi.fn() }));
vi.mock("./generatePdfDetails", () => ({ generatePdfDetails: vi.fn() }));
const header = new Uint8Array(24);
header.set([137, 80, 78, 71, 13, 10, 26, 10]);
header.set([73, 72, 68, 82], 12);
new DataView(header.buffer).setUint32(16, 500);
new DataView(header.buffer).setUint32(20, 500);
const detail = {
  page: 2,
  x: 0,
  y: 0,
  width: 144,
  height: 144,
  pageWidth: 2592,
  pageHeight: 1728,
  dpi: 250,
  pixelWidth: 500,
  pixelHeight: 500,
  data: "data:image/png;base64," + btoa(String.fromCharCode(...header)),
  rotation: 90 as const,
};
const source: AnalysisDocument = {
  id: "plan",
  name: "synthetic.pdf",
  type: "application/pdf",
  data: "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF"),
  pdfText: {
    pageCount: 3,
    truncated: false,
    pages: [
      {
        page: 1,
        status: "Available",
        text: "NEW DECK A 16 ft",
        width: 2592,
        height: 1728,
      },
    ],
  },
};
const destroy = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadPdfSource).mockResolvedValue({
    promise: Promise.resolve({ numPages: 3 }),
    destroy,
  } as never);
  vi.mocked(generatePdfDetails).mockResolvedValue({
    views: [detail],
    scans: 0,
    corrected: 0,
    detailCorrected: 0,
    errors: [],
  });
});
it("retains complete original bytes and selectable text with bounded original-rendered supplements", async () => {
  const r = await supplementWholePdfs([source], new AbortController().signal);
  expect(r.documents[0].data).toBe(source.data);
  expect(r.documents[0].pdfText).toEqual(source.pdfText);
  expect(r.documents[0].detailRegions).toEqual([detail]);
  expect(generatePdfDetails).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    8,
    [],
    expect.anything(),
  );
  expect(source.detailRegions).toBeUndefined();
  expect(destroy).toHaveBeenCalled();
});
it("never replaces explicitly selected views", async () => {
  const d = { ...source, detailRegions: [detail] };
  expect(
    (await supplementWholePdfs([d], new AbortController().signal)).documents,
  ).toEqual([d]);
  expect(loadPdfSource).not.toHaveBeenCalled();
});
it("falls back to the whole original and text if optional rendering fails", async () => {
  vi.mocked(generatePdfDetails).mockRejectedValue(
    new Error("render unavailable"),
  );
  const r = await supplementWholePdfs([source], new AbortController().signal);
  expect(r.documents).toEqual([source]);
  expect(r.notes.join()).toContain(
    "complete original PDF and selectable text still included",
  );
});
it("skips oversized supplements without downsampling or removing originals", async () => {
  vi.mocked(generatePdfDetails).mockResolvedValue({
    views: [{ ...detail, data: detail.data + "A".repeat(12_000_000) }],
    scans: 1,
    corrected: 0,
    detailCorrected: 0,
    errors: [],
  });
  const r = await supplementWholePdfs([source], new AbortController().signal);
  expect(r.documents).toEqual([source]);
  expect(r.notes.join()).toContain("could not fit");
  expect(r.notes.join()).toContain("no OCR guesses");
});
it("cancellation prevents submission", async () => {
  const c = new AbortController();
  c.abort();
  await expect(supplementWholePdfs([source], c.signal)).rejects.toThrow();
  expect(loadPdfSource).not.toHaveBeenCalled();
});
