import { it, expect, vi } from "vitest";
import {
  encodeDetailCanvas,
  optimizeAnalysisPackage,
} from "./optimizeAnalysisPackage";
it("keeps compact linework PNG lossless and does not recode it unnecessarily", () => {
  const toDataURL = vi.fn(() => "data:image/png;base64," + btoa("small png"));
  expect(
    encodeDetailCanvas({ toDataURL } as unknown as HTMLCanvasElement),
  ).toEqual({ data: "data:image/png;base64," + btoa("small png") });
  expect(toDataURL).toHaveBeenCalledTimes(1);
});
it("tries only bounded high quality and refuses oversized details without resizing", () => {
  const toDataURL = vi.fn(
    (type: string, quality?: number) =>
      `data:${type};base64,` +
      btoa(quality === 0.96 ? "small jpeg" : "a".repeat(100)),
  );
  expect(
    encodeDetailCanvas({ toDataURL } as unknown as HTMLCanvasElement, 50),
  ).toMatchObject({ encoding: "JPEG", quality: 0.96 });
  const large = vi.fn(() => "data:image/png;base64," + btoa("a".repeat(100)));
  expect(() =>
    encodeDetailCanvas(
      { toDataURL: large } as unknown as HTMLCanvasElement,
      50,
    ),
  ).toThrow("92%");
  expect(large.mock.calls).toHaveLength(3);
});
it("small packages keep exact originals, details and provenance without image decoding", async () => {
  const source = {
    id: "plan",
    name: "synthetic.pdf",
    type: "application/pdf",
    data: "data:application/pdf;base64," + btoa("%PDF fixture"),
    detailRegions: [],
  };
  expect(await optimizeAnalysisPackage([source])).toEqual([source]);
  expect(source.data).toBe(
    "data:application/pdf;base64," + btoa("%PDF fixture"),
  );
});
