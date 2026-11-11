import { expect, it } from "vitest";
import {
  analysisPageRegions,
  rasterReadingTiles,
  selectAnalysisRegions,
} from "./analysisDetailRegions";
import { detailRenderSize } from "../shared/pdf";
import { overlap } from "./autoDetailRegions";
const survey = { width: 300, height: 200, ink: new Uint8Array(60000).fill(1) };
it("targets structural annotations and dimensions without expanding to a full connected sheet", () => {
  const marks = [
    { text: "3PLY 2X10 PT", x: 900, y: 600, width: 120, height: 6 },
    { text: "24'-3\" OVERALL", x: 940, y: 440, width: 100, height: 6 },
    { text: "JOISTS AT 16 IN O/C", x: 1700, y: 1000, width: 150, height: 6 },
    {
      text: "DRAWN BY PROJECT ADDRESS",
      x: 2400,
      y: 1600,
      width: 140,
      height: 6,
    },
  ];
  const regions = selectAnalysisRegions(
    analysisPageRegions(1, 2592, 1728, marks, survey),
    8,
  );
  expect(regions.some((r) => r.label.includes("Beam"))).toBe(true);
  expect(regions.some((r) => r.label.includes("Joists"))).toBe(true);
  for (const r of regions) {
    expect(r.width).toBeLessThanOrEqual(700);
    expect(r.height).toBe(340);
    expect(() => detailRenderSize(r.width, r.height)).not.toThrow();
    expect(r).not.toHaveProperty("quantity");
  }
  expect(analysisPageRegions(1, 2592, 1728, [marks[3]], survey)).toEqual([]);
});
it("does not crop blank pages or ordinary readable small pages; scans only use occupied content", () => {
  const blank = { ...survey, ink: new Uint8Array(60000) };
  const m = { text: "BEAM 3PLY", x: 100, y: 100, width: 80, height: 16 };
  expect(analysisPageRegions(1, 600, 800, [m], survey)).toEqual([]);
  expect(analysisPageRegions(1, 2592, 1728, [m], blank)).toEqual([]);
  expect(analysisPageRegions(1, 2592, 1728, [], blank)).toEqual([]);
});
it("distributes an economical eight-view budget across pages and topics without heavy overlap or extra assemblies", () => {
  const candidates = Array.from({ length: 12 }, (_, i) => ({
    page: i < 10 ? 1 : 2,
    x: i * 500,
    y: 0,
    width: 420,
    height: 340,
    label: i < 10 ? "Beam / support association" : "Footings / posts",
    score: 30,
  }));
  const selected = selectAnalysisRegions(candidates, 8);
  expect(selected).toHaveLength(8);
  expect(selected.some((r) => r.page === 2)).toBe(true);
  expect(
    selected.every((a, i) =>
      selected.slice(i + 1).every((b) => overlap(a, b) <= 0.45),
    ),
  ).toBe(true);
  expect(selectAnalysisRegions(candidates, 1, [candidates[0]])[0]).not.toEqual(
    candidates[0],
  );
});

it("allows a bounded larger reading budget without an unbounded image package", () => {
  const candidates = Array.from({ length: 20 }, (_, i) => ({
    page: i + 1,
    x: 0,
    y: 0,
    width: 420,
    height: 340,
    label: "Beam",
    score: 20,
  }));
  expect(selectAnalysisRegions(candidates)).toHaveLength(8);
  expect(selectAnalysisRegions(candidates, 4)).toHaveLength(4);
  expect(selectAnalysisRegions(candidates, 99)).toHaveLength(12);
});
it("does not spend the image budget on a title block containing construction headings and weak dimensions", () => {
  const titles = Array.from({ length: 14 }, (_, i) => ({
    text:
      i % 2
        ? "FOUNDATION AND DECK FRAMING PLAN"
        : "PROJECT NAME AND POSTAL CODE",
    x: 2100,
    y: 1300 + i * 10,
    width: 200,
    height: 6,
  }));
  const marks = [
    ...titles,
    { text: "24'-3\"", x: 2140, y: 1350, width: 60, height: 6 },
    { text: "3PLY 2X10 PT", x: 500, y: 600, width: 120, height: 6 },
    {
      text: "JOISTS 2X6 AT 16 IN O/C",
      x: 1100,
      y: 1000,
      width: 160,
      height: 6,
    },
  ];
  const selected = selectAnalysisRegions(
    analysisPageRegions(1, 2592, 1728, marks, survey),
  );
  expect(selected.length).toBeGreaterThan(0);
  expect(selected.every((r) => r.x < 1800)).toBe(true);
});
it("suppresses redundant annotation windows even where geometry overlap alone was previously allowed", () => {
  const first = {
    page: 1,
    x: 0,
    y: 0,
    width: 420,
    height: 340,
    label: "Beam",
    score: 30,
    evidenceKeys: ["same-annotation"],
  };
  const duplicate = { ...first, x: 300, score: 29 };
  const separate = {
    ...first,
    x: 900,
    evidenceKeys: ["separate-assembly-note"],
    score: 28,
  };
  expect(selectAnalysisRegions([first, duplicate, separate], 8)).toEqual([
    first,
    separate,
  ]);
});
it("sideways note bounds receive enough source context for a 250 DPI render without upscaling", () => {
  const [r] = analysisPageRegions(
    1,
    2592,
    1728,
    [
      {
        text: "BEAM CONNECTION SPECIFICATIONS",
        x: 600,
        y: 300,
        width: 6,
        height: 520,
      },
    ],
    survey,
  );
  expect(r.height).toBeGreaterThanOrEqual(520);
  expect(r.height).toBeLessThanOrEqual(700);
  expect(() => detailRenderSize(r.width, r.height)).not.toThrow();
});
it("prioritizes a bounded beam assembly context image for repeated labels without inventing counts or lengths", () => {
  const marks = [200, 380, 560].flatMap((y) =>
    [300, 550, 800].map((x) => ({
      text: "3PLY 2X10 PT",
      x,
      y,
      width: 80,
      height: 6,
    })),
  );
  const selected = selectAnalysisRegions(
    analysisPageRegions(1, 2400, 1600, marks, survey),
    8,
  );
  const context = selected.find((r) =>
    r.label.startsWith("Beam assembly context"),
  )!;
  expect(context).toBeDefined();
  expect(context.height).toBeGreaterThan(340);
  expect(() => detailRenderSize(context.width, context.height)).not.toThrow();
  expect(context).not.toHaveProperty("beamCount");
  expect(context).not.toHaveProperty("length");
});
it("retains bounded connected raster linework as context alongside an overlapping fine crop", () => {
  const s = { width: 600, height: 600, ink: new Uint8Array(360000) };
  // Generic connected framing grid, no drawing-specific dimensions or run count.
  for (let y = 150; y <= 450; y++) s.ink[y * 600 + 150] = 1;
  for (const y of [150, 250, 350, 450])
    for (let x = 150; x <= 450; x++) s.ink[y * 600 + x] = 1;
  const selected = selectAnalysisRegions(
    analysisPageRegions(1, 1200, 1200, [], s),
    8,
  );
  const context = selected.filter((r) =>
    r.label.startsWith("Connected drawing context"),
  );
  expect(context).toHaveLength(1);
  expect(context[0].x).toBeLessThanOrEqual(300);
  expect(context[0].x + context[0].width).toBeGreaterThanOrEqual(900);
  expect(context[0].y + context[0].height).toBeGreaterThanOrEqual(900);
  expect(
    selected.some(
      (r) =>
        !r.label.startsWith("Connected drawing context") &&
        overlap(r, context[0]) > 0.3,
    ),
  ).toBe(true);
  expect(selected.length).toBeLessThanOrEqual(8);
  expect(() =>
    detailRenderSize(context[0].width, context[0].height),
  ).not.toThrow();
  expect(context[0]).not.toHaveProperty("beamCount");
  expect(context[0]).not.toHaveProperty("length");
});

it("auto-selects occupied raster-only drawing areas without manual zoom", () => {
  const width=2400,height=1600;
  const raster={width:240,height:160,ink:new Uint8Array(240*160)};
  for(let y=25;y<125;y++) for(let x=20;x<210;x++)
    if((x+y)%4===0)raster.ink[y*240+x]=1;
  const tiles=rasterReadingTiles(1,width,height,raster);
  expect(tiles.length).toBeGreaterThan(0);
  expect(tiles.every(t=>t.width<=620&&t.height<=480)).toBe(true);
  expect(selectAnalysisRegions(analysisPageRegions(1,width,height,[],raster),8).length).toBeGreaterThan(0);
  expect(rasterReadingTiles(1,width,height,{...raster,ink:new Uint8Array(240*160)})).toEqual([]);
});

it("ranks interior linework ahead of dense sheet-edge title blocks", () => {
  const width=2400,height=1600;
  const raster={width:240,height:160,ink:new Uint8Array(240*160)};
  // Solid title-block/logo patch near the top-left
  for(let y=3;y<45;y++)for(let x=3;x<58;x++)raster.ink[y*240+x]=1;
  // Typical thin engineering linework nearer the middle
  for(let y=55;y<115;y++)for(let x=85;x<160;x++)
    if((x+y)%5===0)raster.ink[y*240+x]=1;
  const tiles=rasterReadingTiles(1,width,height,raster);
  const center=tiles.find(t=>t.x>=620&&t.x<1240&&t.y>=480&&t.y<960);
  const edge=tiles.find(t=>t.x===0&&t.y===0);
  expect(center).toBeDefined();
  expect(edge).toBeDefined();
  expect(center!.score).toBeGreaterThan(edge!.score);
});

it("includes surrounding structural context rather than tightly clipping a raster-only diagram", () => {
  const raster={width:240,height:160,ink:new Uint8Array(240*160)};
  // A continuous outline standing in for a framing diagram on a large sheet.
  for(let x=85;x<=135;x++) {
    raster.ink[55*240+x]=1;
    raster.ink[95*240+x]=1;
  }
  for(let y=55;y<=95;y++) {
    raster.ink[y*240+85]=1;
    raster.ink[y*240+135]=1;
  }
  const regions=analysisPageRegions(1,2400,1600,[],raster);
  const context=regions.find(r=>r.label.startsWith("Connected drawing context"));
  expect(context).toBeDefined();
  expect(context!.width).toBeGreaterThanOrEqual(690);
  expect(context!.height).toBeGreaterThanOrEqual(530);
  expect(()=>detailRenderSize(context!.width,context!.height)).not.toThrow();
  expect(selectAnalysisRegions(regions,8)).toContainEqual(context);
});
