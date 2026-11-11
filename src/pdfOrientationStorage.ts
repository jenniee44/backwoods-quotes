import type { PdfRotation } from "../shared/pdf";
import type { PdfOrientations } from "./PlansTakeoff";

type Source = { id:string; data:string; type:string };
type Saved = Record<string,{ signature:string; pages:Record<number,PdfRotation> }>;
const key = (quoteId:string) => "backwoods:pdf-orientation:"+quoteId;

// Save fingerprints only; never persist image or document bytes a second time.
function signature(data:string):string {
  let h=2166136261;
  const pieces=[data.slice(0,128),data.slice(Math.max(0,Math.floor(data.length/2)-64),Math.floor(data.length/2)+64),data.slice(-128)];
  for(const piece of pieces) for(let i=0;i<piece.length;i++)
    h=Math.imul(h ^ piece.charCodeAt(i),16777619);
  return data.length+":"+(h>>>0).toString(16);
}
export function savePdfOrientations(quoteId:string,docs:Source[],orientations:PdfOrientations):void {
  const saved:Saved={};
  for(const doc of docs) {
    const found=orientations[doc.id];
    if(doc.type!=="application/pdf" || !found || found.source!==doc.data)continue;
    saved[doc.id]={signature:signature(doc.data),pages:found.pages};
  }
  window.localStorage.setItem(key(quoteId),JSON.stringify(saved));
}
export function restorePdfOrientations(quoteId:string,docs:Source[]):PdfOrientations {
  const raw=window.localStorage.getItem(key(quoteId));
  if(!raw)return {};
  const stored=JSON.parse(raw) as Saved;
  const output:PdfOrientations={};
  for(const doc of docs) {
    const saved=stored?.[doc.id];
    if(!saved || doc.type!=="application/pdf" || saved.signature!==signature(doc.data))continue;
    const pages:Record<number,PdfRotation>={};
    for(const [n,value] of Object.entries(saved.pages??{})) {
      const page=Number(n);
      if(Number.isInteger(page)&&page>0&&[0,90,180,270].includes(value))
        pages[page]=value;
    }
    output[doc.id]={source:doc.data,pages};
  }
  return output;
}
