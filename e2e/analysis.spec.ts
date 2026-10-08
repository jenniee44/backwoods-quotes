import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { deckTakeoffFixture } from "../shared/deckTakeoff.fixture";
import { analysisFixture } from "../shared/analysis.fixture";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);
async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Plan test");
  await page.getByLabel("Job name *").fill("Plan quote");
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.getByLabel("Description *").fill("Manual material");
  await page.getByLabel("Unit cost ($)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "test-plan.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(
    page.getByRole("button", { name: "test-plan.png", exact: true }),
  ).toBeVisible();
}
test("AI proposal review, missing quantities, explicit approval, conversion, duplication and document privacy", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    await route.fulfill({ json: analysisFixture(body.documents[0].id) });
  });
  await open(page);
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("DO NOT SCALE DRAWINGS", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-ai-takeoff.png",
    fullPage: true,
  });
  const cards = page.locator("tbody.line-card");
  const labour = cards.nth(0);
  await labour.screenshot({ path: "/tmp/backwoods-ai-review-card.png" });
  const materials = cards.nth(1);
  await labour.locator("summary").click();
  await materials.locator("summary").click();
  await expect(labour.getByLabel("Takeoff quantity")).toHaveValue("");
  await expect(labour.getByText(/Requires contractor input —/)).toBeVisible();
  await expect(
    labour.getByRole("button", { name: "Approve item", exact: true }),
  ).toBeDisabled();
  await labour.getByLabel("Select for approval").check();
  await page
    .getByRole("button", { name: "Approve selected reviewed items" })
    .click();
  await expect(page.getByText(/Review this proposed item first/)).toBeVisible();
  // Saving must not erase the contractor review safeguard message.
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.getByText(/Review this proposed item first/)).toBeVisible();
  await expect(
    labour.getByRole("button", { name: "Approve item", exact: true }),
  ).toBeDisabled();
  await labour.getByLabel("Takeoff quantity").fill("3");
  await labour
    .getByRole("button", { name: "Mark reviewed — I verified this item" })
    .click();
  await labour
    .getByRole("button", { name: "Approve item", exact: true })
    .click();
  await labour
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Labour");
  await expect(
    labour.getByText("Converted to an estimate line.", { exact: false }),
  ).toBeVisible();
  await materials
    .getByRole("button", { name: "Mark reviewed — I verified this item" })
    .click();
  await page
    .getByRole("button", { name: "Approve all reviewed items" })
    .click();
  await materials
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already been analyzed" }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page
    .getByRole("button", { name: "View Estimate", exact: true })
    .click();
  await expect(page.getByLabel("Description *").nth(0)).toHaveValue(
    "Manual material",
  );
  await expect(page.getByLabel("Description *").nth(1)).toHaveValue("Joists");
  await expect(page.getByText(/Pricing required —/)).toBeVisible();
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  const doc = page.locator(".customer-document");
  for (const text of [
    "test-plan.png",
    "DO NOT SCALE",
    "VERIFY ON SITE",
    "confidence",
    "Joists",
    "hours",
    "Manual material",
  ])
    await expect(doc).not.toContainText(text);
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Plan quote/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await expect(
    page.getByText("DO NOT SCALE DRAWINGS", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-ai-takeoff.png",
    fullPage: true,
  });
  await expect(
    page.getByText("Converted to an estimate line.", { exact: false }),
  ).toHaveCount(2);
});
test("invalid/API failure and cancellation preserve manual estimates; corrupt files are rejected", async ({
  page,
}) => {
  await open(page);
  await page.route("**/api/plan-analysis", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Provider unavailable; retry later." },
    }),
  );
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Provider unavailable" }),
  ).toBeVisible();
  await page.unroute("**/api/plan-analysis");
  await page.route("**/api/plan-analysis", (route) =>
    route.fulfill({
      json: { suggestions: [{ cost: 800, status: "Approved" }] },
    }),
  );
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be validated" }),
  ).toBeVisible();
  await expect(page.getByLabel("Takeoff description")).toHaveCount(0);
  await page.unroute("**/api/plan-analysis");
  await page.route("**/api/plan-analysis", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.abort().catch(() => {});
  });
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "cancelled" }),
  ).toBeVisible();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "bad.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 corrupted"),
  });
  await expect(
    page.getByText(/corrupted|valid PDF|damaged/i).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(page.getByLabel("Description *")).toHaveValue("Manual material");
  await expect(page.getByLabel("Unit cost ($)", { exact: true })).toHaveValue(
    "50",
  );
});

test("construction scope, summary-only observations, calculation evidence and safe trade/labour review", async ({
  page,
}) => {
  await page.route("**/api/plan-analysis", async (route) => {
    const fixture = analysisFixture(
      route.request().postDataJSON().documents[0].id,
    );
    const base = fixture.suggestions[1];
    fixture.suggestions = [
      {
        ...base,
        description: "Concrete footings/piers",
        quantity: 5,
        specification: "Footing depth not readable",
        scopeGroup: "Footings & Foundations",
        quantityMethod: "Counted",
        sourceFacts: ["Five distinct footing symbols on foundation plan"],
        calculationBasis: "Counted once; confirm against detail",
        classification: "Calculated quantity",
        confidence: "Medium",
        itemRole: "Construction item",
        warnings: ["Verify footing diameter/depth before pricing"],
      },
      {
        ...base,
        description: "Visible support/footing locations",
        quantity: 5,
        itemRole: "Supporting evidence",
        notes: "Footing location count is evidence only",
      },
      {
        ...base,
        description: "Elevation views",
        quantity: 3,
        itemRole: "Document observation",
      },
      {
        ...base,
        description: "Joists",
        quantity: 11,
        specification: '2x8 PT @ 16" O/C',
        scopeGroup: "Framing",
        quantityMethod: "Calculated",
        sourceFacts: [
          "Written width 160 inches; spacing 16 inches; both edges shown",
        ],
        calculationBasis: "160 / 16 + 1 = 11; verify edge layout",
        classification: "Calculated quantity",
        confidence: "Medium",
        warnings: ["Contractor must verify edge condition"],
      },
      {
        ...base,
        description: "Deck stairs assembly",
        quantity: 2,
        destination: "Subcontractor",
        category: "Other Subcontractor",
        scopeGroup: "Stairs",
        sourceFacts: ["Stair assembly scope shown; no by-others designation"],
        itemRole: "Construction item",
      },
    ];
    await route.fulfill({ json: fixture });
  });
  await open(page);
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  const cards = page.locator("tbody.line-card");
  await expect(cards).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "Major scope detected", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Key readable specifications",
      exact: true,
    }),
  ).toBeVisible();
  const joists = cards.filter({ has: page.locator('input[value="Joists"]') });
  await expect(joists.getByLabel("Calculation basis")).not.toBeVisible();
  await joists.locator("summary").click();
  await expect(joists.getByLabel("Takeoff quantity")).toHaveValue("11");
  await expect(joists.getByLabel("Written specification")).toHaveValue(
    '2x8 PT @ 16" O/C',
  );
  await joists.screenshot({ path: "/tmp/backwoods-compact-takeoff-card.png" });
  await expect(
    joists.getByRole("button", { name: "Approve item", exact: true }),
  ).toBeDisabled();

  await expect(joists.getByLabel("Calculation basis")).toHaveValue(
    "160 / 16 + 1 = 11; verify edge layout",
  );
  await expect(joists.getByLabel("Source facts")).toHaveValue(
    /Written width 160/,
  );
  await joists
    .getByRole("button", { name: "Mark reviewed — I verified this item" })
    .click();
  await joists
    .getByRole("button", { name: "Approve item", exact: true })
    .click();
  await joists
    .getByLabel("Calculation basis")
    .fill("Changed contractor basis; requires re-review");
  await expect(
    joists.getByRole("button", { name: "Approve item", exact: true }),
  ).toBeDisabled();
  await expect(
    joists.getByLabel("Convert reviewed item to estimate"),
  ).toBeDisabled();
  const stairs = cards.filter({
    has: page.locator('input[value="Deck stairs assembly"]'),
  });
  await stairs.locator("summary").click();
  await expect(stairs.getByLabel("Takeoff quantity")).toHaveValue("");
  await expect(stairs.getByText(/enter verified labour hours/)).toBeVisible();

  await expect(stairs.getByLabel("Suggested destination")).toHaveValue(
    "Labour",
  );
  await page
    .getByText("Source observations (not estimate lines)", { exact: true })
    .click();
  await expect(page.locator(".source-observations")).toContainText(
    "Elevation views",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-construction-takeoff-mobile.png",
    fullPage: true,
  });
  await joists
    .getByRole("button", { name: "Mark reviewed — I verified this item" })
    .click();
  await joists
    .getByRole("button", { name: "Approve item", exact: true })
    .click();
  await joists
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await page
    .getByRole("button", { name: "View Estimate", exact: true })
    .click();
  await page.getByLabel("Unit cost ($)", { exact: true }).nth(1).fill("15");
  await page
    .getByText("Approved takeoff evidence (private snapshot)", { exact: true })
    .click();
  await expect(
    page.getByText(
      "Calculation basis: Changed contractor basis; requires re-review",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  const doc = page.locator(".customer-document");
  for (const text of [
    "sourceFacts",
    "Calculation basis",
    "160 / 16",
    "confidence",
    "Footing location count",
    "test-plan.png",
    "Verify footing",
    "2x8 PT",
  ])
    await expect(doc).not.toContainText(text);
  for (const mode of ["Simplified", "Detailed"]) {
    await page.getByLabel("Customer quote mode").selectOption(mode);
    await page.emulateMedia({ media: "print" });
    const pdfPath = `/tmp/backwoods-ai-private-${mode}.pdf`;
    await page.pdf({ path: pdfPath, format: "Letter", printBackground: true });
    const text = execFileSync("pdftotext", [pdfPath, "-"], {
      encoding: "utf8",
    });
    expect(text).toContain("PROJECT QUOTE");
    expect(text).toContain("$215.00");
    expect(text).not.toMatch(
      /Changed contractor basis|160 \/ 16|sourceFacts|confidence|Footing location count|test-plan\.png|Verify footing|2x8 PT|Written width|INTERNAL|markup|profit/i,
    );
    await page.emulateMedia({ media: "screen" });
  }
});

test("useful deck observations become specific estimate candidates while unknowns, scope inclusion and public privacy remain guarded", async ({
  page,
}) => {
  await page.route("**/api/plan-analysis", async (route) => {
    const documentId = route.request().postDataJSON().documents[0].id;
    const data = deckTakeoffFixture(documentId);
    data.suggestions.push({
      ...analysisFixture(documentId).suggestions[0],
      description: "Deck framing labour",
      quantity: 24,
      quantityMethod: "Calculated",
      calculationBasis: "Guessed productivity hours",
      sourceFacts: ["Deck framing scope visible"],
    });
    await route.fulfill({ json: data });
  });
  await open(page);
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Takeoff description")).toHaveCount(6);
  const card = (description: string) =>
    page
      .locator(".takeoff-group .line-card")
      .filter({ has: page.locator(`input[value="${description}"]`) });
  const posts = card("6x6 PT posts");
  const beam = card("3-ply 2x10 PT beam runs");
  const joists = card("2x6 PT deck joists");
  const hardware = card("Simpson LUS26 joist hangers");
  const footing = card("Apparent new footing/pier assemblies");
  const labour = card("Deck framing labour");
  for (const item of [posts, beam, joists, hardware, footing, labour])
    await item.locator("summary").click();
  await expect(posts.getByLabel("Takeoff quantity")).toHaveValue("3");
  await expect(beam.getByLabel("Takeoff quantity")).toHaveValue("4");
  await expect(beam.getByLabel("Takeoff unit")).toHaveValue("runs");
  for (const item of [joists, hardware, labour]) {
    await expect(item.getByLabel("Takeoff quantity")).toHaveValue("");
    await expect(
      item.getByLabel("Convert reviewed item to estimate"),
    ).toBeDisabled();
  }
  await expect(joists).toContainText("2x6 PT deck joists @ 16 in. O.C.");
  await expect(hardware).toContainText("Simpson LUS26");
  await expect(labour.getByLabel("Takeoff unit")).toHaveValue("hours");
  const observations = page.locator(".source-observations");
  await observations.locator("summary").click();
  await expect(observations).toContainText(
    "Visible support locations on plan: 12",
  );
  await expect(observations).toContainText("Total visible locations");
  await expect(observations).toContainText("High source confidence");
  await expect(footing.getByLabel("Takeoff quantity")).toHaveValue("7");
  await expect(footing).toContainText("Apparent new work");
  await footing
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("contract scope");
  await footing.getByLabel("I verified existing/new/by-others status").check();
  await footing
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await footing
    .getByRole("button", { name: "Approve item", exact: true })
    .click();
  await expect(
    footing.getByLabel("Convert reviewed item to estimate"),
  ).toBeEnabled();
  await posts
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await posts
    .getByRole("button", { name: "Approve item", exact: true })
    .click();
  await posts
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await expect(posts).toContainText("Converted to an estimate line");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("backwoods-quotes-v1")!).quotes.find(
      (q: { name: string }) => q.name === "Plan quote",
    ),
  );
  expect(stored.lines[0].description).toBe("Manual material");
  expect(stored.lines[0].cost).toBe(50);
  expect(stored.lines[1]).toMatchObject({
    description: "6x6 PT posts",
    cost: 0,
    category: "Posts",
    quantity: 3,
  });
  expect(stored.analysisReports[0].sourceObservations[2]).toMatchObject({
    confidence: "High",
    classification: "Plan fact",
  });
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  const publicQuote = page.locator(".customer-document");
  for (const internal of [
    "sourceObservations",
    "sourceFacts",
    "supportBasis",
    "scopeVerified",
    "High source confidence",
    "Simpson LUS26",
    "Total visible locations",
    "test-plan.png",
    "DO NOT SCALE",
  ])
    await expect(publicQuote).not.toContainText(internal);
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: /Plan quote/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await expect(card("2x6 PT deck joists")).toContainText(
    "2x6 PT deck joists @ 16 in. O.C.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("autosave persists its snapshot without overwriting a newer editor update", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create New Quote", exact: true })
    .click();
  await page.getByLabel("Customer name *").fill("Autosave customer");
  await page.getByLabel("Job name *").fill("Original project");
  await page.evaluate(() => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      originalSet.call(this, key, value);
      if (key !== "backwoods-quotes-v1") return;
      const input = document.querySelector(
        'input[value="Original project"]',
      ) as HTMLInputElement | null;
      if (!input) return;
      Storage.prototype.setItem = originalSet;
      // Reproduce an editor update arriving as an older autosave snapshot is
      // persisted. Autosave must not write that old snapshot back to the editor.
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "Newer editor update");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
  });
  await expect(page.getByLabel("Job name *")).toHaveValue(
    "Newer editor update",
  );
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("backwoods-quotes-v1")!).quotes.find(
            (q: { customer: { name: string } }) =>
              q.customer.name === "Autosave customer",
          )?.name,
      ),
    )
    .toBe("Newer editor update");
});
