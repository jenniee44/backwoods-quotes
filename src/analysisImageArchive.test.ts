import { afterEach, expect, it, vi } from "vitest";
import {
  archiveKey,
  readImages,
  retainImages,
  removeQuoteImages,
  sourceHash,
} from "./analysisImageArchive";
import type { ImageArchive } from "./analysisImageArchive";
afterEach(() => vi.unstubAllGlobals());
const archive = (quoteId: string): ImageArchive => ({
  key: archiveKey(quoteId, "report"),
  quoteId,
  images: [
    {
      documentId: "synthetic",
      documentName: "Synthetic.pdf",
      sourceHash: "not-an-original-copy",
      region: {
        page: 1,
        x: 10,
        y: 20,
        width: 100,
        height: 100,
        pageWidth: 600,
        pageHeight: 800,
        dpi: 250,
        pixelWidth: 348,
        pixelHeight: 348,
        data: "data:image/png;base64,synthetic-exact-submitted-bytes",
        rotation: 180,
        orientationUncertain: true,
      },
    },
  ],
});
it("keeps exact submitted images in this session when private storage is unavailable without writing quote storage", async () => {
  vi.stubGlobal("indexedDB", {
    open: () => {
      throw new Error("Quota exceeded");
    },
  });
  const a = archive("quota-fixture");
  expect(await retainImages(a)).toBe(false);
  expect((await readImages(a.key))?.images[0].region.data).toBe(
    a.images[0].region.data,
  );
  expect((await readImages(a.key))?.images[0].region.orientationUncertain).toBe(
    true,
  );
});
it("quote-specific deletion preserves unrelated submitted images", async () => {
  vi.stubGlobal("indexedDB", {
    open: () => {
      throw new Error("Unavailable");
    },
  });
  const a = archive("delete-a"),
    b = archive("keep-b");
  await retainImages(a);
  await retainImages(b);
  await removeQuoteImages(a.quoteId);
  expect(await readImages(a.key)).toBeUndefined();
  expect(await readImages(b.key)).toEqual(b);
});
it("source hashes distinguish a replaced document without copying original PDFs into the archive", async () => {
  expect(await sourceHash("original-synthetic")).not.toBe(
    await sourceHash("replacement-synthetic"),
  );
  expect(await sourceHash("original-synthetic")).toBe(
    await sourceHash("original-synthetic"),
  );
});
