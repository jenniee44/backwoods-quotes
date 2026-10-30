// Invented regression sections, not an engineering design or customer drawing.
import { structuredTakeoffFixture } from "./structuredTakeoff.fixture";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
export function sectionTakeoffFixture() {
  const result = structuredTakeoffFixture();
  const base = {
    ...result.suggestions[0],
    materialInputs: [],
    drawingDimensions: [],
    beamAssemblies: [],
  };
  result.dimensions = [];
  result.suggestions = [
    {
      ...base,
      description: "Deck joists",
      assemblyReference: "SECTION-J",
      sourceFacts: [
        "Joist layout width perpendicular to joists: 16 ft",
        "Joist spacing: 16 in",
        "Joist layout: uniform, no openings",
        "Joist layout: both edge members included",
      ],
    },
    {
      ...base,
      description: "Built-up beams",
      specification: "3PLY 2X10 PT",
      assemblyReference: "SECTION-B",
      sourceFacts: [
        "Three distinct centerlines with their own aligned supports, not three labels",
      ],
      beamAssemblies: syntheticDeckBeams(),
    },
    {
      ...base,
      description: "Decking boards",
      specification: "PT decking, actual coverage 5.5 in",
      assemblyReference: "SECTION-D",
      sourceFacts: [
        "Deck layout length: 16 ft",
        "Deck layout width: 12 ft",
        "Deck layout: uniform rectangular, no openings",
        "Actual board width: 5.5 in",
        "Board gap: 1/8 in",
        "Decking direction: along layout length",
        "Pieces per row: 1",
      ],
    },
    {
      ...base,
      description: "PT posts",
      specification: "6x6 PT",
      assemblyReference: "SECTION-P",
      sourceFacts: ["Unique new included post count: 4"],
    },
    {
      ...base,
      description: "Simpson LUS26 joist hangers",
      specification: "Simpson LUS26",
      assemblyReference: "SECTION-H",
      sourceFacts: ["Connection count: 13", "Hangers per connection: 1"],
    },
    {
      ...base,
      description: "Specified ledger fasteners",
      specification: "Specified screw type A",
      assemblyReference: "SECTION-F",
      sourceFacts: ["Connection count: 13", "Fasteners per connection: 2"],
    },
    {
      ...base,
      description: "PT guard railings",
      specification: "PT guard assembly per detail",
      assemblyReference: "SECTION-R",
      sourceFacts: ["Railing length: 32 ft"],
    },
    {
      ...base,
      description: "Stair treads",
      specification: "Two specified boards per tread",
      assemblyReference: "SECTION-T",
      sourceFacts: ["Tread count: 8", "Boards per tread: 2"],
    },
    {
      ...base,
      description: "Ledger flashing",
      specification: "Aluminum ledger flashing",
      assemblyReference: "SECTION-LF",
      sourceFacts: ["Flashing length: 20 ft"],
    },
    {
      ...base,
      description: "PT ledger board",
      specification: "2x8 PT",
      assemblyReference: "SECTION-L",
      sourceFacts: ["Ledger length: 20 ft"],
    },
    {
      ...base,
      description: "Concrete supply cylinders",
      specification: "Concrete cylinders 12 in diameter, 48 in deep",
      assemblyReference: "SECTION-C",
      sourceFacts: [
        "Unique new included footing count: 4",
        "Footing diameter: 12 in",
        "Concrete depth: 48 in",
      ],
    },
  ].map((item) => ({
    ...item,
    location: item.assemblyReference,
    sourceFacts: [...item.sourceFacts, "Source: synthetic, page 1"],
  }));
  return result;
}
