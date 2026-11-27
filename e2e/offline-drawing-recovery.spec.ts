import { expect, test } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import { constructionPdf } from "./fixtures/constructionPdf";
import { readWorkspace } from "./fixtures/readWorkspace";
import { selectEditorTab } from "./fixtures/selectEditorTab";

test("offline drawing recovery preserves the donor and draft prices", async ({
  page,
}) => {
  const store = seed();
  const [draft, donor] = store.quotes;
  draft.name = "Synthetic recovery draft";
  draft.status = "Draft";
  draft.job = undefined;
  draft.takeoff = [];
  donor.name = "Synthetic recovery source";
  const pdf = {
    name: "Synthetic drawing.pdf",
    type: "application/pdf",
    data:
      "data:application/pdf;base64," +
      Buffer.from(constructionPdf(), "ascii").toString("base64"),
    addedAt: "2026-01-01",
  };
  draft.documents = [{ ...pdf, id: "destination-drawing" }];
  donor.documents = [{ ...pdf, id: "donor-drawing" }];
  donor.takeoff = [
    {
      id: "synthetic-observation",
      description: "Synthetic framing observation",
      quantity: 12,
      unit: "each",
      documentId: "donor-drawing",
      page: 1,
      notes: "Review drawing dimensions",
      status: "Approved",
      origin: "ai",
      confidence: "High",
      scopeVerified: true,
      reviewAcknowledged: true,
    },
  ];
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: storageKey, value: JSON.stringify(store) },
  );
  let requests = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Synthetic recovery draft/ }).click();
  const before = await readWorkspace(page);
  await selectEditorTab(page, "Plans & Takeoff");
  const recover = page.getByRole("button", {
    name: "Recover matching drawing observations",
  });
  page.once("dialog", (dialog) => dialog.accept());
  await recover.click();
  await expect(
    page.getByText(
      "Recovered 1 drawing observations. Review quantities before pricing.",
    ),
  ).toBeVisible();
  await recover.click();
  await expect(
    page.getByText("No new matching drawing observations found."),
  ).toBeVisible();
  const after = await readWorkspace(page);
  const original = before.quotes.find((quote) => quote.id === draft.id);
  const restored = after.quotes.find((quote) => quote.id === draft.id);
  expect(restored?.pricing).toEqual(original?.pricing);
  expect(restored?.lines).toEqual(original?.lines);
  expect(restored?.takeoff).toEqual([
    expect.objectContaining({
      documentId: "destination-drawing",
      quantity: null,
      status: "Proposed",
      scopeVerified: false,
    }),
  ]);
  expect(after.quotes.find((quote) => quote.id === donor.id)).toEqual(
    before.quotes.find((quote) => quote.id === donor.id),
  );
  expect(requests).toBe(0);
});
