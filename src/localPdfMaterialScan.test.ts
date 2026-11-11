import { describe, expect, it } from "vitest";
import { newQuote, detailDefaults, companyDefaults } from "./model";
import { proposePdfTextMaterials } from "./localPdfMaterialScan";
const pricing={labourRate:75,materialMarkup:15,overhead:5,contingency:3,hst:13};
function quote(){return newQuote(pricing,[],detailDefaults,companyDefaults);}
describe("local PDF material label extraction",()=>{
  it("adds unpriced, unapproved proposed items without changing existing quote lines",()=>{
    const q=quote();const old=JSON.stringify(q.lines);
    const docs=[{documentId:"p",name:"Plan.pdf",page:1,text:"2X6 PT DECK JOISTS @ 16 O/C 3PLY 2X10 PT SIMPSON LUS26 HANGERS HELICAL PILE"}];
    const next=proposePdfTextMaterials(q,docs);
    expect(next.takeoff.length).toBeGreaterThanOrEqual(3);
    expect(next.takeoff.every(x=>x.quantity===null&&x.status==="Proposed"&&!x.purchaseVerified)).toBe(true);
    expect(JSON.stringify(next.lines)).toBe(old);
    expect(proposePdfTextMaterials(next,docs).takeoff).toHaveLength(next.takeoff.length);
  });
  it("does not pretend scanned-image PDF contains text",()=>{
    const q=quote();expect(proposePdfTextMaterials(q,[{documentId:"p",name:"Scan.pdf",page:1,text:""}])).toBe(q);
  });
});
