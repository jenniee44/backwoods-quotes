import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
for (const width of [1366, 390])
  test(
    "compact purchasing rows and attached requirements at " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const s = seed(),
        q = s.quotes[0];
      q.status = "Draft";
      q.name = "Synthetic compact shopping";
      const t: TakeoffItem = {
        id: "hanger",
        description: "Simpson LUS26 joist hangers",
        specification: "Simpson LUS26",
        quantity: null,
        unit: "each",
        documentId: "synthetic",
        page: 1,
        location: "Deck A",
        notes: "New work",
        confidence: "High",
        destination: "Materials",
        category: "Hangers / connectors",
        status: "Proposed",
        origin: "ai",
        workScope: "New work",
        included: true,
        sourceFacts: ["SYNTHETIC_LONG_EVIDENCE_ONLY_IN_REVIEW"],
        warnings: ["SYNTHETIC_WARNING_ONLY_IN_REVIEW"],
      };
      q.takeoff = [
        t,
        {
          ...t,
          id: "requirement",
          description: "All fasteners shall be galvanized",
          specification: "Hot-dip galvanized fasteners and connectors",
          page: 3,
          sourceFacts: ["SYNTHETIC_GALVANIZED_REQUIREMENT"],
          warnings: [],
        },
        {
          ...t,
          id: "existing",
          description: "Existing house",
          workScope: "Existing work to remain",
          included: false,
        },
      ];
      await page.goto("/");
      await page.evaluate(
        ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
        { s, key: storageKey },
      );
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic compact shopping/ })
        .click();
      await page
        .getByRole("button", { name: "Plans & Takeoff", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Preliminary Shopping List/ })
        .click();
      const list = page.locator(".preliminary-materials");
      await expect(list.locator("thead th")).toHaveText([
        "Material",
        "Specification",
        "Quantity",
        "Unit",
        "Status",
        "Review Details",
      ]);
      await expect(list.locator("tbody tr")).toHaveCount(1);
      await expect(list).toContainText("To confirm");
      await expect(list).toContainText("Drawing requirements attached");
      await expect(list).not.toContainText(
        "SYNTHETIC_LONG_EVIDENCE_ONLY_IN_REVIEW",
      );
      await expect(list).not.toContainText("SYNTHETIC_WARNING_ONLY_IN_REVIEW");
      await expect(list).not.toContainText("All fasteners shall be galvanized");
      await expect(list.locator("tbody details[open]")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await list
          .locator("tbody tr")
          .evaluate((e) => e.getBoundingClientRect().height),
      ).toBeLessThan(width > 720 ? 110 : 300);
      await list
        .getByRole("button", { name: "Review details", exact: true })
        .click();
      await page.locator("#takeoff-hanger .takeoff-advanced > summary").click();
      const review = page.locator("#takeoff-hanger .purchasing-review-context");
      await expect(review).toContainText(
        "SYNTHETIC_LONG_EVIDENCE_ONLY_IN_REVIEW",
      );
      await expect(review).toContainText("SYNTHETIC_WARNING_ONLY_IN_REVIEW");
      await expect(
        review.getByRole("region", { name: "Related drawing requirements" }),
      ).toContainText("SYNTHETIC_GALVANIZED_REQUIREMENT");
      await page
        .getByRole("button", { name: "Back to Materials Summary" })
        .click();
      await expect(page.locator("#summary-hanger")).toHaveClass(
        /material-navigation-highlight/,
      );
    },
  );
