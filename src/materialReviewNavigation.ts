/** Navigate using DOM IDs, never selector interpolation of user-controlled IDs. */
export function revealMaterial(id: string, container?: HTMLElement | null) {
  const element = document.getElementById(id);
  if (!element || (container && !container.contains(element)))
    throw new Error(
      "This material could not be located. Return to Materials Summary and select it again.",
    );
  const reduced = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  element.setAttribute("tabindex", "-1");
  element.focus({ preventScroll: true });
  element.scrollIntoView({
    block: "start",
    behavior: reduced ? "auto" : "smooth",
  });
  element.classList.remove("material-navigation-highlight");
  // Restart the brief highlight even when the same material is selected twice.
  void element.offsetWidth;
  element.classList.add("material-navigation-highlight");
  return element;
}
