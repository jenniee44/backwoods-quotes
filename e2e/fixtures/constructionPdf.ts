// Synthetic vector/selectable-text construction sheet; no real customer plans.
export const constructionNotes = [
  'JOISTS: 2x8 PT @ 16" O/C',
  "BEAM: 3-PLY 2x10 PT",
  'FOOTING: 12" DIAMETER, VERIFY DEPTH ON SITE',
  "LEDGER: FASTEN PER CONNECTION DETAIL",
  "STAIRS: VERIFY RISER/TREAD NOTES",
  "GUARD: REFER TO GUARD DETAIL",
  "DO NOT SCALE DRAWINGS",
  "PRIVATE_PLAN_TEXT_ONLY",
];
export function constructionPdf({
  width = 2592,
  height = 1728,
  pages = 1,
  notes = constructionNotes,
}: { width?: number; height?: number; pages?: number; notes?: string[] } = {}) {
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let page = 0; page < pages; page++) {
    const stream = `0.35 w 30 30 ${width - 60} ${height - 60} re S\n30 ${height - 200} 420 150 re S\nBT /F1 6 Tf 40 ${height - 45} Td 12 TL\n${notes.map((note) => `(${escape(note)}) Tj T*`).join("\n")}\nET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + page * 2} 0 R >>`,
    );
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  let pdf = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
