import { expect, test } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import { canConvert } from "../src/planAnalysis";
import { constructionPdf } from "./fixtures/constructionPdf";
import { readWorkspace } from "./fixtures/readWorkspace";
import { selectEditorTab } from "./fixtures/selectEditorTab";

test("offline recovery lets the owner choose a verified source and remembers proposals after refresh", async ({
  page,
}) => {
  const store = seed();
  const [draft, first, second] = store.quotes;
  draft.name = "Synthetic recovery draft";
  draft.takeoff = [];
  const pdf = {
    name: "Synthetic drawing.pdf",
    type: "application/pdf",
    data:
      "data:application/pdf;base64," +
      Buffer.from(constructionPdf(), "ascii").toString("base64"),
    addedAt: "2026-01-01",
  };
  draft.documents = [{ ...pdf, id: "destination-drawing" }];
  for (const [index, donor] of [first, second].entries()) {
    const documentId = "donor-drawing-" + index;
    const analysisId = "synthetic-analysis-" + index;
    donor.name = ["Synthetic first source", "Synthetic second source"][index];
    donor.documents = [{ ...pdf, id: documentId }];
    donor.analysisReports = [
      {
        id: analysisId,
        fingerprint: analysisId,
        createdAt:
          index === 0 ? "2025-02-15T12:00:00Z" : "2026-02-15T12:00:00Z",
        sourceDocuments: [{ id: documentId, name: pdf.name }],
        assumptions: [],
        warnings: [],
      },
    ];
    donor.takeoff = [
      "Shared drawing observation",
      ["First source only", "Second source only"][index],
    ].map((description, i) => ({
      id: analysisId + "-observation-" + i,
      description,
      quantity: 12,
      unit: "each",
      documentId,
      analysisId,
      page: 1,
      notes: "Review drawing dimensions",
      status: "Approved",
      origin: "ai",
      confidence: "High",
      scopeVerified: true,
      reviewAcknowledged: true,
    }));
  }
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
  const openDraft = async () => {
    await page
      .getByRole("button", { name: /Synthetic recovery draft/ })
      .click();
    await selectEditorTab(page, "Plans & Takeoff");
  };
  await page.goto("/");
  await openDraft();
  const before = await readWorkspace(page);
  const openRecovery = page.getByRole("button", {
    name: "Recover matching drawing observations",
  });
  const source = page.getByRole("combobox", {
    name: "Source quote",
    exact: true,
  });
  const verified = page.getByRole("checkbox", {
    name: /I verified this source quote/,
  });
  const apply = page.getByRole("button", {
    name: "Recover from selected quote",
  });
  const observations = page.getByRole("list", {
    name: "Available observations",
  });

  await openRecovery.click();
  await expect(
    source
      .locator("option")
      .filter({ hasText: first.number + " · " + first.name }),
  ).toHaveCount(1);
  await expect(
    source
      .locator("option")
      .filter({ hasText: second.number + " · " + second.name }),
  ).toHaveCount(1);
  await source.selectOption(first.id);
  await expect(observations).toContainText("First source only");
  await verified.check();
  await source.selectOption(second.id);
  await expect(apply).toBeDisabled();
  await expect(observations).toContainText("Second source only");
  await expect(observations).toContainText("Shared drawing observation");
  await expect(observations).toContainText(/Analysis date:.*2026/);
  await expect(observations).not.toContainText("First source only");
  await verified.check();
  await apply.click();
  await expect(
    page.getByText(
      "Recovered 2 drawing observations. Review quantities before pricing.",
    ),
  ).toBeVisible();

  await page.reload();
  await openDraft();
  const after = await readWorkspace(page);
  const original = before.quotes.find((quote) => quote.id === draft.id);
  const recovered = after.quotes.find((quote) => quote.id === draft.id);
  expect(recovered?.pricing).toEqual(original?.pricing);
  expect(recovered?.lines).toEqual(original?.lines);
  expect(recovered?.takeoff.map((item) => item.description)).toEqual([
    "Shared drawing observation",
    "Second source only",
  ]);
  for (const item of recovered?.takeoff ?? []) {
    expect(item).toMatchObject({
      documentId: "destination-drawing",
      quantity: null,
      status: "Proposed",
      scopeVerified: false,
      reviewAcknowledged: false,
    });
    expect(canConvert(item)).toBe(false);
  }

  await openRecovery.click();
  await expect(
    source
      .locator("option")
      .filter({ hasText: second.number + " · " + second.name }),
  ).toHaveCount(0);
  await source.selectOption(first.id);
  await expect(observations.getByRole("listitem")).toHaveCount(1);
  await expect(observations).toContainText("First source only");
  await verified.check();
  await apply.click();
  await expect(
    page.getByText(
      "Recovered 1 drawing observation. Review quantities before pricing.",
    ),
  ).toBeVisible();
  await page.reload();
  await openDraft();
  await openRecovery.click();
  await expect(
    page.getByText("No new matching drawing observations found."),
  ).toBeVisible();
  const final = await readWorkspace(page);
  expect(
    final.quotes.find((quote) => quote.id === draft.id)?.takeoff,
  ).toHaveLength(3);
  for (const donor of [first, second]) {
    expect(final.quotes.find((quote) => quote.id === donor.id)).toEqual(
      before.quotes.find((quote) => quote.id === donor.id),
    );
  }
  expect(requests).toBe(0);
});
