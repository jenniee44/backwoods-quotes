import { normalizeSpecification } from "./componentIdentity";
/** Notation aliases for display grouping only. Never establishes physical identity. */
export function materialSpecificationKey(
  specification: string,
  category?: string,
) {
  let text = specification
    .replace(/\bP\.\s*T\.?(?=\s|$)/gi, "PT")
    .replace(/@/g, " at ")
    .replace(/(\d+)\s*(?:["″]|\binches?\b)/gi, "$1 in")
    .replace(/\bo\s*[./]?\s*c\b\.?/gi, "on centre")
    .replace(/\bon center\b/gi, "on centre");
  if (category === "Joists")
    text = text.replace(/\b(?:deck\s+)?joists?\b/gi, "");
  if (category === "Beams")
    text = text.replace(/\b(?:built[- ]up\s+)?beams?\b/gi, "");
  return normalizeSpecification(text);
}
