import { afterEach, expect, it, vi } from "vitest";
import { revealMaterial } from "./materialReviewNavigation";
afterEach(() => vi.unstubAllGlobals());
function setup(reduced = false) {
  const element = {
    setAttribute: vi.fn(),
    focus: vi.fn(),
    scrollIntoView: vi.fn(),
    offsetWidth: 120,
    classList: { remove: vi.fn(), add: vi.fn() },
  };
  vi.stubGlobal("document", { getElementById: vi.fn(() => element) });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
  return element;
}
it("focuses, positions and highlights the exact target without mutating material data", () => {
  const e = setup();
  expect(revealMaterial("takeoff-synthetic")).toBe(e);
  expect(document.getElementById).toHaveBeenCalledWith("takeoff-synthetic");
  expect(e.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(e.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "smooth",
  });
  expect(e.classList.add).toHaveBeenCalledWith("material-navigation-highlight");
});
it("respects reduced-motion preferences when returning to the original summary row", () => {
  const e = setup(true);
  revealMaterial("summary-synthetic");
  expect(e.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "auto",
  });
});
it("fails clearly for missing targets and rows outside the expected summary container", () => {
  setup();
  vi.stubGlobal("document", { getElementById: () => null });
  expect(() => revealMaterial("missing")).toThrow("could not be located");
  const e = setup();
  const container = { contains: vi.fn(() => false) } as unknown as HTMLElement;
  expect(() => revealMaterial("wrong", container)).toThrow(
    "could not be located",
  );
  expect(e.scrollIntoView).not.toHaveBeenCalled();
});
