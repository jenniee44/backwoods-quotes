import { downloadTakeoffAnalysis } from "./takeoffAnalysisExport";
import { AnalysisFailure } from "../shared/analysisErrors";
import {
  DrawingLocationContext,
  type DrawingLocation,
} from "./DrawingLocationContext";
import SubmittedImageGallery from "./SubmittedImageGallery";
import {
  archiveKey,
  discardImageArchive,
  retainImages,
  sourceHash,
  type SubmittedImage,
} from "./analysisImageArchive";
import type { PreparedDetail } from "./detailReadability";
import { assertDetailInclusion } from "./detailPackage";
import { analysisBatches, analyzeBatches } from "./analysisBatches";
import { recoverSavedPlanAnalysis } from "./planAnalysis";
import AutoDetailSelection from "./AutoDetailSelection";
import DetailViewEditor from "./DetailViewEditor";
import TakeoffTable from "./TakeoffTable";
import MaterialsSummary from "./MaterialsSummary";
import { deriveDrawingQuantities } from "./drawingDerivedQuantities";
import { supplementWholePdfs } from "./wholePdfAnalysis";
import { loadPdfSource } from "./pdfSource";
import { normalizeRotation } from "../shared/pdf";
import { restorePdfOrientations, savePdfOrientations } from "./pdfOrientationStorage";
import { revealMaterial } from "./materialReviewNavigation";
import { assertScope } from "./takeoffScope";
import { consolidateTakeoff } from "./consolidateTakeoff";
import { optimizeAnalysisPackage } from "./optimizeAnalysisPackage";
import {
  analysisPackageSize,
  packageProblem,
  dataBytes,
} from "../shared/analysisPackage";
import type { AnalysisDocument } from "../shared/analysis";
import { preparePlanAnalysis } from "./preparePlanAnalysis";
import { maxDetailRegions } from "../shared/pdf";
import type { PdfDetailRegion, PdfRotation } from "../shared/pdf";
import {
  planAnalysisService,
  documentFingerprint,
  addAnalysisSuggestions,
  editTakeoff,
  approveTakeoffBatch,
} from "./planAnalysis";
import { validatePlanFile } from "./validatePlanFile";
import PdfPreview from "./PdfPreview";
import { useEffect, useState, useRef, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { id } from "./model";
import type { Quote, PlanDocument, TakeoffItem } from "./model";
function DocumentPreview({
  document: d,
  onDetail,
  detailsDisabled,
  onDetailBusy,
  rotations,
  onRotation,
  location,
}: {
  location?: DrawingLocation;
  rotations: Record<number, PdfRotation>;
  onRotation: (page: number, rotation: PdfRotation) => void;
  document: PlanDocument;
  onDetail: (region: PdfDetailRegion) => void;
  detailsDisabled: boolean;
  onDetailBusy: (busy: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const base64 = d.data.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const next = URL.createObjectURL(new Blob([bytes], { type: d.type }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [d]);
  return (
    <>
      <a href={url} download={d.name} className="back">
        Download {d.name}
      </a>
      {d.type === "application/pdf" ? (
        <PdfPreview
          url={url}
          location={location}
          rotations={rotations}
          onRotation={onRotation}
          onDetail={onDetail}
          detailsDisabled={detailsDisabled}
          onDetailBusy={onDetailBusy}
        />
      ) : (
        <img className="plan-preview" src={url} alt={d.name} />
      )}
    </>
  );
}
export type PdfOrientations = Record<
  string,
  { source: string; pages: Record<number, PdfRotation> }
>;
export default function PlansTakeoff({
  orientations,
  setOrientations,
  quote: q,
  locked,
  onChange,
  onPersistAnalysis,
  onError,
  onViewEstimate,
  simpleMode = false,
}: {
  orientations: PdfOrientations;
  setOrientations: React.Dispatch<React.SetStateAction<PdfOrientations>>;
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  onPersistAnalysis: (q: Quote) => boolean;
  onError: (s: string) => void;
  onViewEstimate?: () => void;
  simpleMode?: boolean;
}) {
  const [showTechnical, setShowTechnical] = useState(false);
  const simplified = simpleMode && !showTechnical;
  const [excludedDocuments, setExcludedDocuments] = useState<string[]>([]);
  // Temporary full-resolution detail views. Bound to exact source bytes; not saved in
  // customer records, persisted attachments, or reused after PDF replacement.
  const [detailViews, setDetailViews] = useState<
    {
      id: string;
      documentId: string;
      originalData: string;
      region: PreparedDetail;
      automatic?: boolean;
    }[]
  >([]);
  const validDetails = useMemo(
    () =>
      detailViews.filter((view) =>
        q.documents.some(
          (d) => d.id === view.documentId && d.data === view.originalData,
        ),
      ),
    [detailViews, q.documents],
  );
  const [detailGroup, setDetailGroup] = useState("All details");
  const detailGroups = [
    ...new Set(
      validDetails.map((v) => v.region.reviewGroup || "Manual details"),
    ),
  ];
  const attentionDetails = validDetails.filter(
    (v) => v.region.orientationUncertain || v.region.cropNeedsReview,
  );
  const [excludedDetails, setExcludedDetails] = useState<string[]>([]);
  const [originalOnlyConfirmed, setOriginalOnlyConfirmed] = useState(false);
  const selectedDetails = validDetails.filter(
    (v) =>
      !excludedDocuments.includes(v.documentId) &&
      !excludedDetails.includes(v.id),
  );
  const emptyDetailPackage =
    validDetails.length > 0 &&
    selectedDetails.length === 0 &&
    !originalOnlyConfirmed;
  const [previewReady, setPreviewReady] = useState<Record<string, string>>({});
  const allPreviewsReady = validDetails
    .filter(
      (v) =>
        v.automatic &&
        !excludedDocuments.includes(v.documentId) &&
        !excludedDetails.includes(v.id),
    )
    .every((v) => previewReady[v.id] === v.region.data);
  const [detailsInspected, setDetailsInspected] = useState(false);
  const selectedDocuments = useMemo(
    () =>
      q.documents
        .filter((d) => !excludedDocuments.includes(d.id))
        .map((d) => ({
          ...d,
          ...(validDetails.some(
            (v) => v.documentId === d.id && !excludedDetails.includes(v.id),
          )
            ? {
                detailRegions: validDetails
                  .filter(
                    (v) =>
                      v.documentId === d.id && !excludedDetails.includes(v.id),
                  )
                  .map((v) => v.region),
              }
            : {}),
        })),
    [q.documents, excludedDocuments, validDetails, excludedDetails],
  );
  const [analysisPackage, setAnalysisPackage] = useState<{
    sources: AnalysisDocument[];
    documents: AnalysisDocument[];
    error: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void optimizeAnalysisPackage(selectedDocuments, controller.signal)
      .then((documents) => {
        assertDetailInclusion(selectedDocuments, documents);
        if (documents.length) analysisBatches(documents);
        if (!controller.signal.aborted)
          setAnalysisPackage({
            sources: selectedDocuments,
            documents,
            error: "",
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setAnalysisPackage({
            sources: selectedDocuments,
            documents: selectedDocuments,
            error:
              packageProblem(selectedDocuments) || (error as Error).message,
          });
      });
    return () => controller.abort();
  }, [selectedDocuments]);
  const packageReady = analysisPackage?.sources === selectedDocuments;
  const packageSize = analysisPackageSize(
    packageReady ? analysisPackage.documents : selectedDocuments,
  );
  const capturedSize = analysisPackageSize(selectedDocuments);
  const latest = useRef(q);
  latest.current = q;
  const request = useRef<AbortController | null>(null);
  const [analysisState, setAnalysisState] = useState("Ready to analyze");
  // A browser reload cannot guarantee that an in-flight server request
  // survived. Retain a private warning rather than silently resubmitting it.
  const pendingKey = "backwoods:analysis-pending:" + q.id;
  const [interrupted, setInterrupted] = useState(() => {
    try { return !!window.localStorage.getItem("backwoods:analysis-pending:" + q.id); }
    catch { return false; }
  });
  useEffect(() => {
    try { setInterrupted(!!window.localStorage.getItem(pendingKey)); }
    catch { setInterrupted(false); }
  }, [pendingKey]);

  const completedBatches = useRef<{
    quoteId: string;
    fingerprint: string;
    sources: { id: string; data: string }[];
    results: Map<string, import("../shared/analysis").PlanAnalysisResult>;
  } | null>(null);
  useEffect(() => {
    if (
      completedBatches.current &&
      (completedBatches.current.quoteId !== q.id ||
        !completedBatches.current.sources.every((s) =>
          q.documents.some((d) => d.id === s.id && d.data === s.data),
        ))
    )
      completedBatches.current = null;
  }, [q.id, q.documents]);
  useEffect(() => {
    try {
      const restored=restorePdfOrientations(q.id,q.documents);
      if(Object.keys(restored).length)
        setOrientations(previous=>({...previous,...restored}));
    } catch { /* local browser storage is optional */ }
  },[q.id,q.documents,setOrientations]);
  const [readingBudget, setReadingBudget] = useState(8);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState("");
  const [overviewImages, setOverviewImages] = useState<{source:string;label:string;page:number}[]>([]);
  const [preflightImages, setPreflightImages] = useState<
    { source: string; label: string; page: number }[]
  >([]);
  async function checkAutomaticDrawingDetails(orientationOverride?: PdfOrientations) {
    if (preflightBusy || request.current || locked) return;
    const controller = new AbortController();
    setPreflightBusy(true);
    setPreflightImages([]);
    setOverviewImages([]);
    setPreflightMessage("Preparing drawing details locally — no AI request…");
    try {
      const documents = structuredClone(selectedDocuments);
      const pageTurns = Object.fromEntries(documents.map(d => [
        d.id, (orientationOverride ?? orientations)[d.id]?.source === d.data
          ? (orientationOverride ?? orientations)[d.id].pages : {},
      ]));
      const result = await supplementWholePdfs(
        documents, controller.signal, setPreflightMessage, readingBudget, pageTurns,
      );
      // First show a whole-sheet orientation/context view. This preview is
      // local only; the unchanged original PDF already goes to analysis.
      const overviews: {source:string;label:string;page:number}[]=[];
      for (const doc of documents.filter(d=>d.type==="application/pdf").slice(0,3)) {
        const task=await loadPdfSource(doc.data);
        try {
          const pdf=await task.promise;
          for(let pageNumber=1;pageNumber<=Math.min(pdf.numPages,3);pageNumber++){
            const page=await pdf.getPage(pageNumber);
            const rotation=normalizeRotation(page.rotate+(pageTurns[doc.id]?.[pageNumber]??0));
            const sheet=page.getViewport({scale:1,rotation});
            const viewport=page.getViewport({
              scale:Math.min(1.6,1400/Math.max(sheet.width,sheet.height)),
              rotation,
            });
            const canvas=document.createElement("canvas");
            canvas.width=Math.max(1,Math.round(viewport.width));
            canvas.height=Math.max(1,Math.round(viewport.height));
            try{
              const context=canvas.getContext("2d");
              if(!context)throw new Error("Cannot render whole-sheet overview.");
              await page.render({canvas,canvasContext:context,viewport}).promise;
              overviews.push({
                source:canvas.toDataURL("image/jpeg",0.82),
                label:doc.name+" — whole sheet, orientation check (preview only)",
                page:pageNumber,
              });
            }finally{
              canvas.width=0;canvas.height=0;
              page.cleanup();
            }
          }
        }finally{await task.destroy();}
      }
      setOverviewImages(overviews);
      const images = result.reviewViews.map(v => ({
        source: v.region.data,
        label: v.region.label || "Automatic drawing detail",
        page: v.region.page,
      }));
      setPreflightImages(images);
      setPreflightMessage(images.length
        ? `Prepared ${images.length} automatic 250 DPI drawing detail(s), without paid AI. The original plan is included separately in analysis. Review is still needed before ordering materials.`
        : "No high-resolution drawing details could be prepared automatically. Do not run paid analysis yet; inspect source PDF quality or preparation errors.");
    } catch(e) {
      setPreflightMessage("Free drawing preparation failed: " + (e as Error).message);
    } finally {
      setPreflightBusy(false);
    }
  }

  async function rotateAllDrawingPages(clockwise: 90 | -90) {
    if (preflightBusy || locked) return;
    const pdfDocs = selectedDocuments.filter(d => d.type === "application/pdf");
    if (!pdfDocs.length) return;
    setPreflightBusy(true);
    try {
      const revised: PdfOrientations = {...orientations};
      for (const doc of pdfDocs) {
        const task = await loadPdfSource(doc.data);
        try {
          const pdf = await task.promise;
          const previousPages = orientations[doc.id]?.source === doc.data
            ? orientations[doc.id].pages : {};
          const pages = {...previousPages};
          for (let page = 1; page <= pdf.numPages; page++) {
            pages[page] = normalizeRotation((pages[page] ?? 0) + clockwise);
          }
          revised[doc.id] = {source:doc.data,pages};
        } finally {
          await task.destroy();
        }
      }
      setOrientations(revised);
      try { savePdfOrientations(q.id,q.documents,revised); }
      catch { /* preview still works in private browsing */ }
      setPreflightImages([]);
      setPreflightMessage("Rotation applied. Rebuilding drawing previews locally…");
      await checkAutomaticDrawingDetails(revised);
    } catch(e) {
      setPreflightMessage("Rotation failed: " + (e as Error).message);
    } finally {
      setPreflightBusy(false);
    }
  }
  const [analysisError, setAnalysisError] = useState("");
  const lastFailure = useRef<{ fingerprint: string; message: string } | null>(
    null,
  );
  const [reviewError, setReviewError] = useState("");
  const [inputNotes, setInputNotes] = useState<string[]>([]);
  const [submittedPackage, setSubmittedPackage] = useState<{
    sources: typeof selectedDocuments;
    count: number;
    pages: number;
    bytes: number;
  } | null>(null);
  const [detailRendering, setDetailRendering] = useState(false);
  const [automaticRendering, setAutomaticRendering] = useState(false);
  const detailProcessing = detailRendering || automaticRendering;
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const busy =
    analysisState === "Uploading/preparing" ||
    analysisState === "Analyzing plans" ||
    analysisState === "Recovering saved analysis";
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  async function analyze(recoverOnly = false) {
    if (
      (validDetails.some(
        (v) =>
          v.automatic &&
          !excludedDocuments.includes(v.documentId) &&
          !excludedDetails.includes(v.id),
      ) &&
        (!detailsInspected || !allPreviewsReady)) ||
      emptyDetailPackage ||
      request.current ||
      locked ||
      detailProcessing ||
      !packageReady ||
      analysisPackage.error ||
      (interrupted && !recoverOnly)
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setAnalysisError("");
    setReviewError("");
    setInputNotes([]);
    setAnalysisState(recoverOnly ? "Uploading/preparing" : "Uploading/preparing");
    let attemptFingerprint = "";
    try {
      const documents = structuredClone(analysisPackage.documents);
      assertDetailInclusion(selectedDocuments, documents);
      analysisBatches(documents);
      const sourceFingerprint = await documentFingerprint(documents);
      const pageTurns = Object.fromEntries(
        documents.map((d) => [
          d.id,
          orientations[d.id]?.source === d.data ? orientations[d.id].pages : {},
        ]),
      );
      const orientationKey = Object.values(pageTurns).some((p) =>
        Object.values(p).some((turn) => turn !== 0),
      )
        ? `:orientation-${JSON.stringify(pageTurns)}`
        : "";
      const fingerprint =
        sourceFingerprint +
        (readingBudget === 8 ? "" : `:reading-${readingBudget}`) +
        orientationKey;
      attemptFingerprint = fingerprint;
      if (
        latest.current.analysisReports?.some(
          (report) => report.fingerprint === fingerprint,
        )
      )
        throw new Error(
          "These plans have already been analyzed. Review the existing proposed items.",
        );
      const originalText = await preparePlanAnalysis(
        documents.map((d) => {
          const copy = { ...d };
          delete copy.detailRegions;
          return copy;
        }),
        controller.signal,
      );
      const textWithSelectedDetails = originalText.map((d) => ({
        ...d,
        ...(documents.find((s) => s.id === d.id)?.detailRegions
          ? {
              detailRegions: documents.find((s) => s.id === d.id)!
                .detailRegions,
            }
          : {}),
      }));
      const automatic = originalOnlyConfirmed
        ? { documents: textWithSelectedDetails, notes: [], reviewViews: [] }
        : await supplementWholePdfs(
            textWithSelectedDetails,
            controller.signal,
            (message) => setInputNotes([message]),
            readingBudget,
            pageTurns,
          );
      const prepared = automatic.documents;
      // Prevent another paid request when an image-only PDF has no readable
      // detail images. The unchanged original is still retained in the quote.
      const unreadableImageOnly = prepared.filter(d =>
        d.type === "application/pdf" &&
        d.pdfText?.pages.length &&
        d.pdfText.pages.every(page => !page.text.trim()) &&
        !(d.detailRegions?.length)
      );
      if (unreadableImageOnly.length) {
        throw new Error(
          "No selectable text or detail images are available for: " +
          unreadableImageOnly.map(d => d.name).join(", ") +
          ". No AI request was made. Review the PDF detail preparation or add readable detail views before analyzing."
        );
      }
      // Explicit selections remain intact. Automatic supplements are temporary and
      // bound to these exact original bytes, never persisted in quote attachments.
      assertDetailInclusion(
        documents,
        prepared.map((d) => ({
          ...d,
          detailRegions: documents.find((original) => original.id === d.id)
            ?.detailRegions?.length
            ? d.detailRegions
            : undefined,
        })),
      );
      controller.signal.throwIfAborted();
      setSubmittedPackage({
        sources: selectedDocuments,
        count: analysisPackageSize(prepared).detailCount,
        pages: prepared.reduce((n, d) => n + (d.pdfText?.pageCount ?? 0), 0),
        bytes: analysisPackageSize(prepared).total,
      });
      setInputNotes([
        ...automatic.notes,
        ...prepared
          .filter((d) => d.type === "application/pdf")
          .flatMap((d) => {
            const layer = d.pdfText;
            const notes = [
              `${d.name}: unchanged original PDF + selectable text from ${layer?.pages.filter((p) => p.text).length ?? 0} page(s) + ${d.detailRegions?.length ?? 0} full-resolution detail view(s).`,
            ];
            if (layer?.pages.some((p) => p.positionsTruncated))
              notes.push(
                `${d.name}: supplemental text positions are incomplete at the processing limit. The complete original PDF remains included; unknown associations require contractor review.`,
              );
            if (layer?.truncated)
              notes.push(
                `${d.name}: supplemental text was truncated at the request limit. Full original PDF is still sent; select fewer files or targeted detail views for missing notes.`,
              );
            for (const p of layer?.pages ?? [])
              if (
                p.status === "No selectable text" ||
                p.status === "Unavailable"
              )
                notes.push(
                  `${d.name}, page ${p.page}: ${p.status === "Unavailable" ? "selectable text extraction unavailable" : "no selectable text layer"}. Original PDF visuals remain available; no OCR guesses added.`,
                );
            return notes;
          }),
      ]);
      // The marker is only written just before a potentially paid request.
      // No file bytes, personal details or AI output are stored in it.
      if (!recoverOnly) {
        try { window.localStorage.setItem(pendingKey, String(Date.now())); }
        catch { /* private browser storage may be disabled */ }
      }
      setAnalysisState(recoverOnly ? "Recovering saved analysis" : "Analyzing plans");
      if (completedBatches.current?.fingerprint !== fingerprint)
        completedBatches.current = {
          quoteId: q.id,
          fingerprint,
          sources: selectedDocuments.map(({ id, data }) => ({ id, data })),
          results: new Map(),
        };
      const batchCache = completedBatches.current.results;
      if (batchCache.size)
        setInputNotes((notes) => [
          ...notes,
          "Resuming completed batches from this browser session for the exact same submitted sources. Only unfinished batches contact the provider again.",
        ]);
      let submittedDetails = 0;
      const submittedImages: SubmittedImage[] = [];
      const hashes = new Map(
        await Promise.all(
          prepared.map(async (d) => [d.id, await sourceHash(d.data)] as const),
        ),
      );
      const rememberSubmitted = (docs: AnalysisDocument[]) => {
        submittedDetails += analysisPackageSize(docs).detailCount;
        for (const d of docs)
          for (const region of d.detailRegions ?? []) {
            const diagnostic = [
              ...automatic.reviewViews,
              ...validDetails.map((v) => ({
                documentId: v.documentId,
                region: v.region,
              })),
            ].find(
              (v) =>
                v.documentId === d.id &&
                v.region.page === region.page &&
                v.region.rotation === region.rotation &&
                v.region.x === region.x &&
                v.region.y === region.y,
            );
            submittedImages.push({
              documentId: d.id,
              documentName: d.name,
              sourceHash: hashes.get(d.id)!,
              sourceDetailView:
                1 +
                (prepared
                  .find((source) => source.id === d.id)
                  ?.detailRegions?.findIndex(
                    (r) =>
                      r.page === region.page &&
                      r.x === region.x &&
                      r.y === region.y &&
                      r.rotation === region.rotation &&
                      r.data === region.data,
                  ) ?? -1),
              region: {
                ...region,
                orientationUncertain: diagnostic?.region.orientationUncertain,
                cropNeedsReview: diagnostic?.region.cropNeedsReview,
                inspectionNote: diagnostic?.region.inspectionNote,
              },
            });
          }
        setInputNotes((notes) => [
          ...notes.filter((n) => !n.startsWith("Submitted detail views:")),
          `Submitted detail views: ${submittedDetails} of ${analysisPackageSize(prepared).detailCount}. Original files included in every request.`,
        ]);
      };
      const result = await analyzeBatches(
        prepared,
        controller.signal,
        (docs, signal) => {
          if (recoverOnly) return recoverSavedPlanAnalysis(docs, signal).then(saved => {
              if (!saved) throw new Error("No completed server-side result was found for this batch. No paid AI request was made.");
              return saved;
            });
          return planAnalysisService.analyze(docs, signal);
        },
        (number, total) =>
          setInputNotes((notes) => [
            ...notes.filter((n) => !n.startsWith("Analyzing batch")),
            recoverOnly
              ? `Checking saved batch ${number} of ${total} without paid AI.`
              : `Analyzing batch ${number} of ${total}. Original PDFs accompany every batch; nothing is added until all succeed.`,
          ]),
        batchCache,
        rememberSubmitted,
        q.id,
      );
      controller.signal.throwIfAborted();
      if (
        (await documentFingerprint(
          latest.current.documents
            .filter((d) => documents.some((source) => source.id === d.id))
            .map((d) => ({
              ...d,
              ...(documents.find((source) => source.id === d.id)?.detailRegions
                ? {
                    detailRegions: documents.find(
                      (source) => source.id === d.id,
                    )!.detailRegions,
                  }
                : {}),
            })),
        )) !== sourceFingerprint
      )
        throw new Error(
          "Source files changed during analysis. Results were not added; analyze the current files.",
        );
      const reportId = id();
      const retained = submittedImages.length
        ? await retainImages({
            key: archiveKey(latest.current.id, reportId),
            quoteId: latest.current.id,
            images: submittedImages,
          })
        : true;
      if (
        controller.signal.aborted ||
        !prepared.every((d) =>
          latest.current.documents.some(
            (source) => source.id === d.id && source.data === d.data,
          ),
        )
      ) {
        await discardImageArchive(archiveKey(latest.current.id, reportId));
        controller.signal.throwIfAborted();
        throw new Error(
          "Source changed while retaining images. Analyze the current source; no results were added.",
        );
      }
      const next = addAnalysisSuggestions(
        latest.current,
        deriveDrawingQuantities(result, prepared),
        fingerprint,
        selectedDocuments,
        reportId,
      );
      const report = next.analysisReports!.at(-1)!;
      report.aiDetails = {
        submittedCount: submittedImages.length,
        retentionMessage: retained
          ? "Saved privately on this device. Images are not included in quote exports or customer PDFs."
          : "Images are available for this session only. Browser image storage is full or unavailable; existing quote data was not replaced. Reopening may not retain these images.",
      };
      // A paid analysis must not be reported as saved merely because React
      // updated the editor. Persist the complete takeoff and report synchronously.
      const saved = onPersistAnalysis(next);
      onChange(next);
      if (saved) {
        try { window.localStorage.removeItem(pendingKey); } catch { /* optional */ }
        setInterrupted(false);
      }
      if (!saved) {
        setAnalysisState("Analysis complete — NOT saved");
        setAnalysisError(
          "Analysis completed, but the quote could not be saved on this device. " +
          "Keep this tab open. Free browser storage and use Save before closing. " +
          "Do not pay to analyze the same plans again."
        );
        return;
      }
      lastFailure.current = null;
      completedBatches.current = null;
      setAdvancedReview(false);
      setReviewTarget(null);
      requestAnimationFrame(() =>
        summaryRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        }),
      );
      setAnalysisState(
        result.suggestions.length || result.dimensions?.length
          ? "Analysis complete — needs review"
          : "Analysis complete — no usable takeoff found",
      );
    } catch (error) {
      if (request.current === controller) {
        // A definite server rejection cannot have produced billable results.
        // Timeouts/interruptions remain uncertain and require acknowledgement.
        if (!controller.signal.aborted &&
            error instanceof AnalysisFailure &&
            ["ANALYSIS_IN_PROGRESS", "ANALYSIS_COOLDOWN", "ANALYSIS_DAILY_LIMIT",
             "ANALYSIS_TRACKING_UNAVAILABLE"].includes(error.code)) {
          try { window.localStorage.removeItem(pendingKey); } catch { /* optional */ }
          setInterrupted(false);
        }
        const protectedRequest =
          error instanceof AnalysisFailure &&
          ["ANALYSIS_IN_PROGRESS", "ANALYSIS_COOLDOWN"].includes(error.code);
        setAnalysisState(
          controller.signal.aborted
            ? "Analysis cancelled"
            : protectedRequest
              ? error.code === "ANALYSIS_IN_PROGRESS"
                ? "Analysis already in progress"
                : "Plans recently analyzed"
              : "Analysis failed",
        );
        const message = controller.signal.aborted
          ? "Analysis cancelled. Existing estimates are unchanged."
          : (error as Error).message;
        const previous =
          protectedRequest &&
          lastFailure.current?.fingerprint === attemptFingerprint
            ? ` Previous failure: ${lastFailure.current.message}`
            : "";
        const retry =
          error instanceof AnalysisFailure && error.retryAfterSeconds
            ? ` Retry after ${error.retryAfterSeconds} seconds.`
            : "";
        setAnalysisError(message + retry + previous);
        if (!protectedRequest && !controller.signal.aborted)
          lastFailure.current = { fingerprint: attemptFingerprint, message };
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setAnalysisState((state) =>
          ["Uploading/preparing", "Analyzing plans"].includes(state)
            ? "Ready to analyze"
            : state,
        );
      }
    }
  }
  function updateItem(
    item: TakeoffItem,
    action: (item: TakeoffItem) => TakeoffItem,
  ) {
    try {
      const next = action(item);
      if (next.status === "Approved") assertScope(q, next);
      setReviewError("");
      onChange({
        ...q,
        takeoff: q.takeoff.map((t) => (t.id === item.id ? next : t)),
      });
    } catch (error) {
      setReviewError((error as Error).message);
    }
  }
  function bulkApprove(reviewedOnly = false) {
    const chosen = q.takeoff.filter(
      (t) =>
        !t.convertedLineId &&
        (reviewedOnly ? t.status === "Reviewed" : selectedItems.includes(t.id)),
    );
    try {
      const next = approveTakeoffBatch(q, chosen);
      setReviewError("");
      onChange(next);
      setSelectedItems([]);
    } catch (error) {
      setReviewError((error as Error).message);
    }
  }
  const [advancedReview, setAdvancedReview] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [reviewTarget, setReviewTarget] = useState<{
    id: string;
    request: number;
  } | null>(null);
  function openMaterialDetails(id: string) {
    if (!q.takeoff.some((t) => t.id === id)) {
      setReviewError(
        "This material could not be located. Refresh the material list and try again.",
      );
      return;
    }
    setReviewError("");
    setAdvancedReview(true);
    setReviewTarget((target) => ({ id, request: (target?.request ?? 0) + 1 }));
  }
  function backToSummary() {
    try {
      if (!reviewTarget)
        throw new Error(
          "The original Materials Summary row could not be located.",
        );
      revealMaterial("summary-" + reviewTarget.id, summaryRef.current);
      setReviewError("");
    } catch (e) {
      setReviewError((e as Error).message);
    }
  }
  const [drawingLocation, setDrawingLocation] = useState<DrawingLocation>();
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const current = q.documents.find((d) => d.id === selected) ?? q.documents[0];
  async function attach(files: FileList | null, replaceId?: string) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      if (!replaceId && q.documents.length + files.length > 8)
        throw new Error("Attach up to 8 documents per quote.");
      const added = await Promise.all(
        Array.from(files).map(async (f) => {
          if (
            ![
              "application/pdf",
              "image/jpeg",
              "image/png",
              "image/webp",
            ].includes(f.type) ||
            f.size > 2000000
          )
            throw new Error(
              "Use PDF, JPEG, PNG or WebP files up to 2 MB each. Browser storage is limited; compress larger drawings.",
            );
          if (
            f.type === "application/pdf" &&
            new TextDecoder().decode(await f.slice(0, 5).arrayBuffer()) !==
              "%PDF-"
          )
            throw new Error("This file is not a valid PDF.");
          const data = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error("Unable to read document."));
            r.readAsDataURL(f);
          });
          const document = {
            id: replaceId ?? id(),
            name: f.name,
            type: f.type,
            data,
            addedAt: new Date().toISOString(),
          } as PlanDocument;
          await validatePlanFile(document);
          return document;
        }),
      );
      onChange({
        ...q,
        documents: replaceId
          ? q.documents.map((d) => (d.id === replaceId ? added[0] : d))
          : [...q.documents, ...added],
        takeoff: replaceId
          ? q.takeoff.map((t) =>
              t.documentId === replaceId
                ? {
                    ...t,
                    status: "Proposed",
                    confidence: "Unspecified",
                    reviewAcknowledged: false,
                    scopeVerified: false,
                    conflictsVerified: false,
                    sourceDetailView: null,
                  }
                : t,
            )
          : q.takeoff,
      });
      setSelected(added[0].id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function patch(item: TakeoffItem, delta: Partial<TakeoffItem>) {
    if (delta.documentId !== undefined)
      delta = {
        ...delta,
        sourceDocumentName: q.documents.find((d) => d.id === delta.documentId)
          ?.name,
        sourceDetailView: null,
      };
    if (delta.page !== undefined) delta = { ...delta, sourceDetailView: null };
    setReviewError("");
    onChange({
      ...q,
      takeoff: q.takeoff.map((t) =>
        t.id === item.id ? editTakeoff(t, delta) : t,
      ),
    });
  }
  return (
    <DrawingLocationContext.Provider
      value={(documentId, beam) => {
        const source = q.documents.find((d) => d.id === documentId);
        if (!source || source.type !== "application/pdf") {
          onError(
            "The original PDF is not attached. Reattach it to locate this proposed beam.",
          );
          return;
        }
        setSelected(documentId);
        setDrawingLocation({ documentId, beam, request: Date.now() });
        window.requestAnimationFrame(() =>
          window.document
            .querySelector(".drawing-workspace")
            ?.scrollIntoView({ block: "start", behavior: "smooth" }),
        );
      }}
    >
      {simpleMode && (
        <section className="info" aria-label="Simple plan analysis">
          <h3>Upload your plans and let AI read them</h3>
          <p>Upload once, then analyze once. Your saved drawings stay attached to the quote. We will show a preliminary budget next; uncertain quantities will be marked as allowances, not confirmed lumber orders.</p>
          {q.analysisReports?.length ? <p><strong>Saved analysis available.</strong> You can review your preliminary estimate without paying for another analysis.</p> : null}
          <button className="button secondary" type="button" onClick={() => setShowTechnical((value) => !value)}>{showTechnical ? "Hide technical details" : "Show technical details (optional)"}</button>
        </section>
      )}
      <section
        className="drawing-workspace"
        aria-label="Original construction plans"
      >
        <h3 className="subheading">Plans & documents</h3>
        <p className="muted">
          PDF plans, engineer drawings or photos · up to 8 files, 2 MB each.
          Stored in this browser. Save the quote after attaching; total browser
          storage may be smaller than combined file sizes.
        </p>
        <fieldset disabled={locked || uploading || busy}>
          <label className="upload">
            {uploading
              ? "Reading documents…"
              : "Attach plans / drawings / images"}
            <input
              aria-label="Attach plans"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                void attach(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </fieldset>
        <div className="document-list">
          {q.documents.map((d) => (
            <div key={d.id}>
              <button
                className="button secondary document-name"
                aria-pressed={current?.id === d.id}
                onClick={() => setSelected(d.id)}
              >
                {d.name}
              </button>
              {!simplified && <label className="check-options">
                <input
                  type="checkbox"
                  disabled={busy || locked}
                  checked={!excludedDocuments.includes(d.id)}
                  onChange={(e) => {
                    setDetailsInspected(false);
                    setOriginalOnlyConfirmed(false);
                    setExcludedDocuments(
                      e.target.checked
                        ? excludedDocuments.filter((id) => id !== d.id)
                        : [...excludedDocuments, d.id],
                    );
                  }}
                />
                Include in analysis
              </label>}
              {!simplified && <fieldset disabled={locked || uploading || busy}>
                <label className="replace-document">
                  Replace
                  <input
                    aria-label={`Replace ${d.name}`}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      void attach(e.target.files, d.id);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  className="icon danger"
                  aria-label={`Remove document ${d.name}`}
                  onClick={() => {
                    onChange({
                      ...q,
                      documents: q.documents.filter((x) => x.id !== d.id),
                      takeoff: q.takeoff.map((t) =>
                        t.documentId === d.id
                          ? {
                              ...t,
                              status: "Proposed",
                              confidence: "Unspecified",
                              reviewAcknowledged: false,
                              scopeVerified: false,
                              conflictsVerified: false,
                              sourceDetailView: null,
                            }
                          : t,
                      ),
                    });
                    setSelected(null);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </fieldset>}
            </div>
          ))}
        </div>
        {current && !simplified && (
          <DocumentPreview
            document={current}
            location={
              drawingLocation?.documentId === current.id
                ? drawingLocation
                : undefined
            }
            rotations={
              orientations[current.id]?.source === current.data
                ? orientations[current.id].pages
                : {}
            }
            onRotation={(page, rotation) =>
              setOrientations((previous) => ({
                ...previous,
                [current.id]: {
                  source: current.data,
                  pages: {
                    ...(previous[current.id]?.source === current.data
                      ? previous[current.id].pages
                      : {}),
                    [page]: rotation,
                  },
                },
              }))
            }
            onDetailBusy={setDetailRendering}
            detailsDisabled={
              locked ||
              busy ||
              uploading ||
              detailProcessing ||
              validDetails.length >= maxDetailRegions
            }
            onDetail={(region) => {
              if (validDetails.length >= maxDetailRegions) {
                onError("Include up to 24 detail views per analysis.");
                return;
              }
              if (
                validDetails.some(
                  (v) =>
                    v.documentId === current.id &&
                    v.region.page === region.page &&
                    v.region.rotation === region.rotation &&
                    v.region.x === region.x &&
                    v.region.y === region.y &&
                    v.region.width === region.width &&
                    v.region.height === region.height,
                )
              ) {
                onError("This PDF detail view is already included.");
                return;
              }
              setDetailsInspected(false);
              setOriginalOnlyConfirmed(false);
              setExcludedDocuments((ids) =>
                ids.filter((id) => id !== current.id),
              );
              setDetailViews([
                ...validDetails,
                {
                  id: id(),
                  documentId: current.id,
                  originalData: current.data,
                  region,
                },
              ]);
            }}
          />
        )}
      </section>
      <div className="info">
        <b>
          {simplified ? "1 Upload → 2 AI analysis → 3 Review estimate → 4 Customer quote" : "1 Upload → 2 Analyze → 3 Review → 4 Approve → 5 Convert to Estimate"}
        </b>
        <p>
          AI-assisted takeoff for estimating purposes only. Verify dimensions,
          quantities, specifications and site conditions before quoting or
          construction.
        </p>
        <p>
          Analysis sends the attached files to the server and OpenAI. Plans may
          contain personal information; redact anything unnecessary first.
          Extracted results stay private to your estimate.
        </p>
      </div>
      {validDetails.some((v) => v.automatic) && !detailsInspected && (
        <p className="info">
          Open Advanced AI Details to inspect the prepared images, then confirm
          the detail-view review before analysis.
        </p>
      )}
      {packageReady &&
        !analysisPackage.error &&
        packageSize.total > 8_000_000 && (
          <p className="info">
            This package will use{" "}
            {analysisBatches(analysisPackage.documents).length} bounded
            requests. Every request includes all selected originals. This
            increases AI cost and uses the existing rate limit; a failure or
            cancellation adds no partial takeoff.
          </p>
        )}
      {q.documents.some(d=>d.type==="application/pdf" && !excludedDocuments.includes(d.id)) && (
        <div className="info">
          <p><strong>Automatic drawing detail check</strong></p>
          <p>The app finds occupied drawing areas and prepares close-ups itself. You do not need to zoom or select regions. This check runs locally and does not charge for AI.</p>
          <button type="button" className="button secondary"
            disabled={preflightBusy || busy || detailProcessing}
            onClick={() => void checkAutomaticDrawingDetails()}>
            {preflightBusy ? "Preparing drawing automatically…" : "Check automatic drawing details — free"}
          </button>
          <div className="heading-actions">
            <button type="button" className="button secondary"
              disabled={preflightBusy || busy}
              onClick={() => void rotateAllDrawingPages(-90)}>
              Rotate all drawing pages left
            </button>
            <button type="button" className="button secondary"
              disabled={preflightBusy || busy}
              onClick={() => void rotateAllDrawingPages(90)}>
              Rotate all drawing pages right
            </button>
          </div>
          <p className="tiny">
            Only use rotation if the automatic views are sideways or upside down.
            One rotation updates every PDF page and all future automatic detail preparation.
            The original PDF stays unchanged. Orientation is not guessed from unreliable OCR.
          </p>
          {preflightMessage && <p role="status">{preflightMessage}</p>}
          {overviewImages.length > 0 && (
            <div>
              <strong>Complete drawing — context and orientation</strong>
              <p className="muted">These whole-sheet previews show the full layout. The smaller 250 DPI images below are for reading details. The original PDF remains unchanged.</p>
              <div className="grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
                {overviewImages.map((view,index)=>(
                  <div key={index}>
                    <img src={view.source} alt={view.label}
                      style={{width:"100%",height:"auto"}} />
                    <small>{view.label}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
          {preflightImages.length > 0 && (
            <div className="grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
              {preflightImages.slice(0,6).map((view,index)=>(
                <div key={index}>
                  <img src={view.source} alt={view.label+" on page "+view.page}
                    style={{width:"100%",height:"auto"}} />
                  <small>Page {view.page}: {view.label}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {interrupted && !busy && (
        <div className="margin-warning" role="alert">
          <strong>Previous AI request may have been interrupted.</strong>
          <p>The app cannot confirm that an unfinished server request completed after a refresh.
          Completed batches that reached this browser can be reused, but an in-flight result
          cannot be recovered here. No new paid request will be sent until you acknowledge this warning.</p>
          <button type="button" className="button secondary"
            onClick={() => {
              try { window.localStorage.removeItem(pendingKey); } catch { /* optional */ }
              setInterrupted(false);
            }}>
            I understand — allow a new analysis request
          </button>
        </div>
      )}
      <div className="heading-actions">
        <button
          className="button"
          disabled={
            (validDetails.some(
              (v) =>
                v.automatic &&
                !excludedDocuments.includes(v.documentId) &&
                !excludedDetails.includes(v.id),
            ) &&
              (!detailsInspected || !allPreviewsReady)) ||
            emptyDetailPackage ||
            locked ||
            busy ||
            detailProcessing ||
            uploading ||
            !packageReady ||
            interrupted ||
            !!analysisPackage?.error ||
            !q.documents.some((d) => !excludedDocuments.includes(d.id))
          }
          onClick={() => void analyze()}
        >
          {simplified ? (q.analysisReports?.length ? "Analyze again (new AI request)" : "Analyze plans with AI") : "Analyze Plans"}
        </button>
        {!busy && !locked && q.documents.length > 0 && (
          <button type="button" className="button secondary"
            onClick={() => void analyze(true)}>
            Check for saved AI results — free
          </button>
        )}
        {busy && (
          <button
            className="button secondary"
            onClick={() => request.current?.abort()}
          >
            Cancel analysis
          </button>
        )}
        {q.takeoff.some((t) => t.convertedLineId) && (
          <button className="button secondary" onClick={onViewEstimate}>
            View Estimate
          </button>
        )}
      </div>
      <div
        style={simplified ? { display: "none" } : undefined}
        className="analysis-package"
        aria-label="Analysis package"
        aria-live="polite"
      >
        <b>Analysis package</b>
        {submittedPackage?.sources === selectedDocuments && (
          <p role="status">
            Whole-document request prepared: {submittedPackage.pages} original
            PDF page(s), {submittedPackage.count} reading supplement(s),{" "}
            {(submittedPackage.bytes / 1_000_000).toFixed(2)} MB. Submission is
            confirmed below only after the server responds.
          </p>
        )}
        {!selectedDetails.length && !originalOnlyConfirmed && (
          <p className="tiny">
            Whole-PDF analysis: all pages and available selectable text are sent
            directly. Useful 250 DPI reading supplements are prepared
            automatically within the existing size limit; manual zoom/cropping
            is optional.
          </p>
        )}
        <p>
          <strong>
            {selectedDetails.length} detail views selected for analysis
          </strong>{" "}
          · {validDetails.length} available previews ·{" "}
          {packageReady
            ? `${submittedPackage?.sources === selectedDocuments ? submittedPackage.count : packageSize.detailCount} prepared for submission`
            : "preparing…"}
        </p>
        {emptyDetailPackage && (
          <div role="alert" className="error">
            No detail views will be sent, although previews exist. Their source
            files or views are excluded. Restore selection before analysis, or
            explicitly choose original-only analysis.
            <button
              className="button secondary"
              onClick={() => {
                setExcludedDetails([]);
                setExcludedDocuments((ids) =>
                  ids.filter(
                    (id) => !validDetails.some((v) => v.documentId === id),
                  ),
                );
                setDetailsInspected(false);
              }}
            >
              Restore detail selection
            </button>
            <button
              className="button secondary"
              onClick={() => setOriginalOnlyConfirmed(true)}
            >
              Use selected originals only
            </button>
          </div>
        )}
        {originalOnlyConfirmed && selectedDetails.length === 0 && (
          <p>
            Original-only analysis explicitly selected. No detail images will be
            submitted.
          </p>
        )}
        <p className="tiny">
          Original files: {(packageSize.originals / 1_000_000).toFixed(2)} MB ·
          Detail views: {(packageSize.details / 1_000_000).toFixed(2)} MB (
          {packageSize.detailCount}) · Estimated total:{" "}
          {(packageSize.total / 1_000_000).toFixed(2)} MB / 8 MB
        </p>
        <p className="tiny">
          {!packageReady
            ? "Preparing high-quality detail optimization…"
            : capturedSize.details > packageSize.details
              ? `Detail encoding optimized from ${(capturedSize.details / 1_000_000).toFixed(2)} MB to ${(packageSize.details / 1_000_000).toFixed(2)} MB. PNG or high-quality JPEG; all 250 DPI pixels and selected views retained.`
              : "Original files unchanged. PNG is kept when compact; larger details use high-quality JPEG at the same 250 DPI pixel dimensions. No automatic view removal."}
        </p>
        {packageReady && packageSize.detailCount > 0 && (
          <details className="tiny">
            <summary>Detail encoding and size</summary>
            <ul>
              {analysisPackage.documents.flatMap((d) =>
                (d.detailRegions ?? []).map((region, index) => (
                  <li key={`${d.id}-${index}`}>
                    {d.name} · Page {region.page} · Detail {index + 1} ·{" "}
                    {region.encoding === "JPEG"
                      ? `JPEG ${Math.round((region.quality ?? 0.96) * 100)}%`
                      : "Lossless PNG"}{" "}
                    · {(dataBytes(region.data) / 1_000_000).toFixed(2)} MB
                  </li>
                )),
              )}
            </ul>
            JPEG encoding can introduce artifacts; verify small notes and use
            Contractor Input Required for unreadable information. Pixels are not
            resized.
          </details>
        )}
        {packageReady && analysisPackage.error && (
          <p className="error" role="alert">
            {analysisPackage.error} Analysis is blocked before any API request.
            <button
              className="button secondary"
              disabled={busy || detailProcessing}
              onClick={() => setExcludedDetails((ids) => [...ids])}
            >
              Rebuild analysis package
            </button>
            Selected sources: {selectedDocuments.map((d) => d.name).join(", ")}.
            Selected details:{" "}
            {selectedDocuments
              .flatMap((d) =>
                (d.detailRegions ?? []).map(
                  (r, i) => `${d.name}, page ${r.page}, detail ${i + 1}`,
                ),
              )
              .join("; ") || "none"}
            .
          </p>
        )}
      </div>
      <p role="status" aria-live="polite">
        {uploading ? "Uploading/preparing" : analysisState}
      </p>
      {busy && <progress aria-label="Plan analysis progress" />}
      {!simplified && inputNotes
        .filter((n) => n.startsWith("Submitted detail views:"))
        .map((n) => (
          <p role="status" key={n}>
            Last analysis run: {n}
          </p>
        ))}
      {!simplified && !!inputNotes.length && (
        <details className="analysis-report">
          <summary>Analysis source quality</summary>
          <ul>
            {inputNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      {analysisError && (
        <p className="error" role="alert">
          {analysisError}
        </p>
      )}
      {simplified ? (
        <section className="panel" ref={summaryRef} aria-label="Next step: estimate">
          <h3>{q.analysisReports?.length ? "Your plan analysis is saved" : "Your next step"}</h3>
          <p>{q.analysisReports?.length ? "The AI has captured drawing information. Quantities that cannot be safely measured are still uncertain. Open the simple estimate to generate or review editable cost allowances." : "After analyzing the plans, continue to one editable preliminary estimate."}</p>
          <button type="button" className="button" onClick={onViewEstimate}>Continue to estimate</button>
          <p className="tiny">Preliminary budget allowances are not supplier quotes, verified cut lists, structural approval, or confirmed site costs.</p>
        </section>
      ) : (
      <>
      {!!q.analysisReports?.length && (
        <details className="analysis-export">
          <summary>Export saved takeoff analysis</summary>
          <p>
            Private troubleshooting file with drawing evidence, extracted
            measurements, calculated proposals and unresolved inputs. No
            original PDFs, images, customer contact details or prices are
            included. Evidence can contain private drawing text; keep this file
            private.
          </p>
          <button type="button" onClick={() => downloadTakeoffAnalysis(q)}>
            Download private analysis JSON
          </button>
        </details>
      )}
      {(q.analysisReports ?? []).map((report) => (
        <details key={report.id} className="analysis-report" open>
          <summary>
            Plan summary · {new Date(report.createdAt).toLocaleDateString()}
          </summary>
          {report.aiDetails && (
            <details className="submitted-ai-details">
              <summary>Advanced AI Details · submitted regions</summary>
              <SubmittedImageGallery
                quoteId={q.id}
                reportId={report.id}
                count={report.aiDetails.submittedCount}
                message={report.aiDetails.retentionMessage}
                documents={q.documents}
                locked={locked || busy}
                onSupplement={(documentId, region, companions) => {
                  const original = q.documents.find((d) => d.id === documentId);
                  if (!original) return;
                  if (
                    validDetails.filter((v) => v.documentId !== documentId)
                      .length +
                      companions.length +
                      1 >
                    maxDetailRegions
                  ) {
                    setAnalysisError(
                      "Remove a prepared detail before adding another (24 total limit).",
                    );
                    return;
                  }
                  setDetailViews((previous) => [
                    ...previous.filter((v) => v.documentId !== documentId),
                    ...companions.map((region) => ({
                      id: id(),
                      documentId,
                      originalData: original.data,
                      region,
                      automatic: true,
                    })),
                    {
                      id: id(),
                      documentId,
                      originalData: original.data,
                      region,
                    },
                  ]);
                  setDetailsInspected(false);
                  setOriginalOnlyConfirmed(false);
                  setExcludedDocuments((ids) =>
                    ids.filter((i) => i !== documentId),
                  );
                  setInputNotes([
                    "Corrected view prepared for a future analysis. Review the manual detail and explicitly choose Analyze Plans; prior images and approvals remain unchanged.",
                  ]);
                }}
              />
            </details>
          )}
          {report.project && (
            <>
              <p>
                <b>
                  {report.project.projectType} · {report.project.drawingTitle}
                </b>
              </p>
              <p>{report.project.description}</p>
              <p className="tiny">
                Drawing sheets analyzed:{" "}
                {report.project.drawingNumbers.join(", ") ||
                  "Sheet labels not readable"}
              </p>
              {!!report.sourceDocuments?.length && (
                <p className="tiny">
                  Sources:{" "}
                  {report.sourceDocuments.map((d) => d.name).join(", ")}
                </p>
              )}
            </>
          )}
          {report.summary && (
            <div className="plan-summary-grid">
              {(
                [
                  ["Major scope detected", report.summary.majorScope],
                  [
                    "Key readable specifications",
                    report.summary.readableSpecifications,
                  ],
                  ["Major unknowns", report.summary.majorUnknowns],
                  ["Site verification", report.summary.siteVerification],
                ] as const
              )
                .filter(([, values]) => values.length)
                .map(([label, values]) => (
                  <section key={label}>
                    <h3>{label}</h3>
                    <ul>
                      {values.slice(0, 6).map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                    {values.length > 6 && (
                      <details>
                        <summary>{values.length - 6} more</summary>
                        <ul>
                          {values.slice(6).map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                ))}
            </div>
          )}
          {!!report.duplicatesReduced && (
            <p className="tiny">
              {report.duplicatesReduced} overlapping suggestion(s) combined or
              skipped. Existing reviewed/converted items were preserved.
            </p>
          )}
          {(!!report.summary?.observations.length ||
            !!report.sourceObservations?.length) && (
            <details className="source-observations">
              <summary>Source observations (not estimate lines)</summary>
              <ul>
                {report.sourceObservations?.map((observation, i) => (
                  <li key={`source-${i}`}>
                    <b>{observation.description}</b>:{" "}
                    {observation.quantity ?? "Quantity not established"}{" "}
                    {observation.unit}
                    {observation.specification && (
                      <p>{observation.specification}</p>
                    )}
                    <p className="tiny">
                      {observation.classification} · {observation.confidence}{" "}
                      source confidence ·{" "}
                      {report.sourceDocuments?.find(
                        (d) => d.id === observation.documentId,
                      )?.name ??
                        q.documents.find((d) => d.id === observation.documentId)
                          ?.name ??
                        "Removed source"}
                      {observation.page ? ` — Page ${observation.page}` : ""}
                      {observation.sourceDetailView
                        ? ` · Detail view ${observation.sourceDetailView}`
                        : ""}
                      {observation.supportBasis &&
                      observation.supportBasis !== "Not established"
                        ? ` · ${observation.supportBasis}`
                        : ""}
                    </p>
                    {!!observation.sourceFacts?.length && (
                      <p className="tiny">
                        {observation.sourceFacts.join("; ")}
                      </p>
                    )}
                    {observation.calculationBasis && (
                      <p className="tiny">{observation.calculationBasis}</p>
                    )}
                  </li>
                ))}
                {report.summary?.observations.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </details>
          )}
          {!!report.dimensions?.length && (
            <>
              <h3>Key dimensions (information only)</h3>
              {report.dimensions.map((dimension, i) => (
                <p key={i}>
                  <b>{dimension.description}</b>:{" "}
                  {dimension.quantity ?? "Requires contractor input"}{" "}
                  {dimension.unit} · {dimension.confidence} confidence ·{" "}
                  {q.documents.find((d) => d.id === dimension.documentId)
                    ?.name ?? "Removed source"}
                  {dimension.page ? ` — Page ${dimension.page}` : ""}
                  <small>{dimension.notes}</small>
                </p>
              ))}
            </>
          )}
          {!!report.assumptions.length && (
            <>
              <h3>Assumptions</h3>
              <ul>
                {report.assumptions.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </>
          )}
          {!!report.warnings.length && (
            <div className="margin-warning">
              <h3>Plan warnings / estimating notes</h3>
              <ul>
                {report.warnings.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      ))}
      <details className="analysis-report">
        <summary>Advanced Settings</summary>
        <label>
          Automatic reading-image budget
          <select
            aria-label="Automatic reading-image budget"
            disabled={busy || locked}
            value={readingBudget}
            onChange={(e) => setReadingBudget(Number(e.target.value))}
          >
            <option value={4}>4 — quicker / lower image cost</option>
            <option value={8}>8 — balanced (default)</option>
            <option value={12}>12 — more detail / higher image cost</option>
          </select>
        </label>
        <p className="tiny">
          This is a maximum, not a target. Useful regions only; the original PDF
          is always included. Existing file/image limits may reduce this count.
          More images may increase API cost and preparation time. Viewing saved
          images is free of AI requests.
        </p>
      </details>
      <p className="tiny">
        Analyze Plans automatically prepares reading images (8 by default within
        the size/cost budget). No separate detail-generation step is required.
        Optional manual corrections can supplement a future analysis.
      </p>
      <details className="advanced-ai-details">
        <summary>Advanced AI Details</summary>
        <p className="tiny">
          Optional troubleshooting and corrections. The original drawing remains
          your workspace; automatic reading images supplement it, never
          represent extra physical materials.
        </p>
        {current?.type === "application/pdf" && (
          <details className="optional-detail-tools">
            <summary>Optional: prepare additional detail views</summary>
            <AutoDetailSelection
              source={current}
              rotations={
                orientations[current.id]?.source === current.data
                  ? orientations[current.id].pages
                  : {}
              }
              existing={validDetails
                .filter((v) => v.documentId === current.id)
                .map((v) => v.region)}
              remainingCapacity={maxDetailRegions - validDetails.length}
              remainingAutomatic={Math.max(
                0,
                20 - validDetails.filter((v) => v.automatic).length,
              )}
              disabled={locked || busy || uploading || detailProcessing}
              onBusy={setAutomaticRendering}
              onAdd={(regions) => {
                setDetailsInspected(false);
                setOriginalOnlyConfirmed(false);
                setExcludedDocuments((ids) =>
                  ids.filter((id) => id !== current.id),
                );
                setDetailViews((previous) => [
                  ...previous,
                  ...regions.map((region) => ({
                    id: id(),
                    documentId: current.id,
                    originalData: current.data,
                    region,
                    automatic: true,
                  })),
                ]);
              }}
            />
          </details>
        )}
        {!!validDetails.length && (
          <div className="pdf-detail-list">
            <h3>Detail views included in analysis</h3>
            <p className="tiny">
              Temporary 250 DPI views rendered directly from the original PDF.
              Up to 20 automatic / 24 total; each analysis request must fit 8
              MB. Larger detail packages use bounded batches. Re-add views after
              leaving this tab. Only views from selected source files are sent.
            </p>
            {validDetails.some((v) => v.automatic) && (
              <label className="check-options">
                <input
                  type="checkbox"
                  disabled={busy || detailProcessing || !allPreviewsReady}
                  checked={detailsInspected && allPreviewsReady}
                  onChange={(e) => setDetailsInspected(e.target.checked)}
                />
                I inspected all selected automatic detail views and their source
                regions.
              </label>
            )}
            <div className="detail-gallery-controls">
              <label className="field">
                <span>Review drawing details</span>
                <select
                  aria-label="Detail review group"
                  value={
                    detailGroups.includes(detailGroup) ||
                    detailGroup === "Needs attention"
                      ? detailGroup
                      : "All details"
                  }
                  onChange={(e) => setDetailGroup(e.target.value)}
                >
                  <option>All details</option>
                  <option value="Needs attention">
                    Needs rotation / crop review ({attentionDetails.length})
                  </option>
                  {detailGroups.map((group) => (
                    <option key={group}>{group}</option>
                  ))}
                </select>
              </label>
              <p role="status">
                {attentionDetails.length} views need rotation or crop attention.
                Selecting a review group never changes which images are
                submitted.
              </p>
              <span>
                {validDetails.length} views · choose a group to compare related
                details. Exclude anything unnecessary.
              </span>
            </div>
            <div className="detail-gallery">
              {validDetails.map((view) => (
                <div
                  className="detail-review-item"
                  hidden={
                    detailGroup === "Needs attention"
                      ? !(
                          view.region.orientationUncertain ||
                          view.region.cropNeedsReview
                        )
                      : detailGroups.includes(detailGroup) &&
                        detailGroup !==
                          (view.region.reviewGroup || "Manual details")
                  }
                  key={view.id}
                >
                  <label className="check-options">
                    <input
                      type="checkbox"
                      aria-label={`Include detail ${view.region.label || view.region.page} in analysis`}
                      checked={
                        !excludedDetails.includes(view.id) &&
                        !excludedDocuments.includes(view.documentId)
                      }
                      disabled={locked || busy || detailProcessing}
                      onChange={(e) => {
                        setDetailsInspected(false);
                        setOriginalOnlyConfirmed(false);
                        setExcludedDetails((ids) =>
                          e.target.checked
                            ? ids.filter((id) => id !== view.id)
                            : [...ids, view.id],
                        );
                        if (e.target.checked)
                          setExcludedDocuments((ids) =>
                            ids.filter((id) => id !== view.documentId),
                          );
                      }}
                    />
                    Include this detail in analysis
                  </label>
                  <DetailViewEditor
                    source={q.documents.find((d) => d.id === view.documentId)!}
                    region={view.region}
                    disabled={locked || busy || detailProcessing}
                    onBusy={setDetailRendering}
                    onPreviewReady={(ready) =>
                      setPreviewReady((previous) => {
                        if (ready && previous[view.id] === view.region.data)
                          return previous;
                        const next = { ...previous };
                        if (ready) next[view.id] = view.region.data;
                        else delete next[view.id];
                        return next;
                      })
                    }
                    onChange={(region) => {
                      setDetailsInspected(false);
                      setDetailViews((previous) =>
                        previous.map((v) =>
                          v.id === view.id ? { ...v, region } : v,
                        ),
                      );
                    }}
                  />
                  <span>
                    {q.documents.find((d) => d.id === view.documentId)?.name} ·
                    Page {view.region.page} · {view.region.pixelWidth} ×{" "}
                    {view.region.pixelHeight} px · 250 DPI ·{" "}
                    {view.region.rotation ?? 0}°
                  </span>
                  <button
                    className="icon danger"
                    disabled={locked || busy}
                    aria-label={`Remove detail view ${view.region.page}`}
                    onClick={() =>
                      setDetailViews(
                        detailViews.filter((v) => v.id !== view.id),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </details>
      <p className="tiny">
        PDF analysis sends the unchanged original file plus its selectable text
        when available. The preview canvas is never an analysis source. Add
        detail views for fine notes on large sheets; no OCR guesses are used.
      </p>
      <h3 className="subheading">Estimate candidates / Takeoff items</h3>
      {reviewError && (
        <p className="error" role="alert">
          {reviewError}
        </p>
      )}
      <div ref={summaryRef}>
        <MaterialsSummary
          key={q.id + ":" + (q.analysisReports?.at(-1)?.id ?? "initial")}
          quote={q}
          locked={locked || busy}
          onChange={onChange}
          onError={setReviewError}
          onAdvanced={openMaterialDetails}
        />
      </div>
      <details className="advanced-review" open={advancedReview}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            setAdvancedReview((v) => !v);
          }}
        >
          Advanced Review
        </summary>
        <p className="muted">
          Changing a measurement resets it to Proposed. Replacing or removing a
          source document also requires re-review. Existing converted estimate
          lines are preserved and must be checked separately.
        </p>
        <details className="takeoff-list-tools">
          <summary>Advanced list tools</summary>
          {!!q.takeoff.some((t) => t.origin === "ai") && (
            <div className="heading-actions">
              <button
                className="button secondary"
                disabled={locked || !selectedItems.length}
                onClick={() => bulkApprove()}
              >
                Approve selected reviewed items
              </button>
              <button
                className="button secondary"
                disabled={
                  locked ||
                  !q.takeoff.some(
                    (t) =>
                      t.origin === "ai" &&
                      t.status === "Reviewed" &&
                      t.reviewAcknowledged &&
                      !t.convertedLineId,
                  )
                }
                onClick={() => bulkApprove(true)}
              >
                Approve all reviewed items
              </button>
            </div>
          )}
          <button
            className="button secondary"
            disabled={locked || busy || !q.takeoff.length}
            onClick={() =>
              window.confirm(
                "Consolidate exact unreviewed duplicates? Quantities will not be added; distinct specifications, assemblies and sources remain separate.",
              ) && onChange({ ...q, takeoff: consolidateTakeoff(q.takeoff) })
            }
          >
            Consolidate exact unreviewed duplicates
          </button>
        </details>
        <TakeoffTable
          reviewTarget={reviewTarget}
          onBackToSummary={backToSummary}
          onReviewMaterial={openMaterialDetails}
          quote={q}
          locked={locked || busy}
          onChange={onChange}
          patch={patch}
          updateItem={updateItem}
          onError={setReviewError}
          selected={selectedItems}
          setSelected={setSelectedItems}
        />
        <button
          className="button secondary"
          disabled={locked}
          onClick={() =>
            onChange({
              ...q,
              takeoff: [
                ...q.takeoff,
                {
                  id: id(),
                  description: "",
                  quantity: null,
                  unit: "each",
                  documentId: "",
                  page: null,
                  notes: "",
                  status: "Proposed",
                  confidence: "Unspecified",
                },
              ],
            })
          }
        >
          <Plus size={17} />
          Add takeoff item
        </button>
      </details>
      </>
      )}
      {simpleMode && showTechnical && (
        <button className="button secondary" type="button" onClick={() => setShowTechnical(false)}>Return to simple steps</button>
      )}
    </DrawingLocationContext.Provider>
  );
}
