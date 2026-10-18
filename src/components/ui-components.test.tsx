import { Clock3 } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, Footer, HistoryView, InfoView, LegalView, StudioHub } from "./AppViews";
import { NumberField, SaveExportButton } from "./CommonControls";
import { ReliefLoadingPreview, ReliefPreviewPlaceholder, ReliefResultCard, SlicerAnalysisCard } from "./ReliefPreview";
import { Settings } from "./SettingsView";
import { TextToStlDialog } from "./TextToStlDialog";
import { darkestColorIndex, formatApiCost, formatStorage, isExcellentReliefResult, type ReliefResult } from "../types/studio";

describe("UI-Komponenten und Studio-Hilfsfunktionen", () => {
  it("rendert den StudioHub mit allen vier Hauptwerkzeugen", () => {
    const html = renderToStaticMarkup(
      <StudioHub
        openImage={vi.fn()}
        openText={vi.fn()}
        openLithophane={vi.fn()}
        openPrompt={vi.fn()}
      />
    );
    expect(html).toContain("Bild zu 3D");
    expect(html).toContain("Schrift zu 3D");
    expect(html).toContain("Foto zu Lithophan");
    expect(html).toContain("Prompt zu 3D");
  });

  it("rendert EmptyState mit Icon, Titel und Beschreibung", () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={Clock3} title="Noch keine Exporte" text="Sobald du dein erstes Modell exportierst, erscheint es hier." />
    );
    expect(html).toContain("Noch keine Exporte");
    expect(html).toContain("Sobald du dein erstes Modell exportierst");
  });

  it("rendert HistoryView für leeren und gefüllten Verlauf", () => {
    const emptyHtml = renderToStaticMarkup(<HistoryView entries={[]} clear={vi.fn()} />);
    expect(emptyHtml).toContain("Deine letzten Modelle");

    const populatedHtml = renderToStaticMarkup(
      <HistoryView
        entries={[
          {
            id: "1",
            name: "wappen.png",
            createdAt: "2026-10-17T12:00:00.000Z",
            triangleCount: 42000,
            widthMm: 100,
            heightMm: 120,
            profile: "logo",
            score: 96
          }
        ]}
        clear={vi.fn()}
      />
    );
    expect(populatedHtml).toContain("wappen.png");
    expect(populatedHtml).toContain("96/100");
  });

  it("rendert InfoView, Footer und LegalView", () => {
    const infoHtml = renderToStaticMarkup(<InfoView version="0.31.45" />);
    expect(infoHtml).toContain("VERSION 0.31.45");
    expect(infoHtml).toContain("Verarbeitungspipeline");

    const footerHtml = renderToStaticMarkup(<Footer version="0.31.45" openLegal={vi.fn()} />);
    expect(footerHtml).toContain("Impressum");
    expect(footerHtml).toContain("Datenschutz");

    const legalHtml = renderToStaticMarkup(<LegalView page="privacy" onClose={vi.fn()} version="0.31.45" />);
    expect(legalHtml).toContain("Datenschutz");
    expect(legalHtml).toContain("Zurück zum Studio");
  });

  it("rendert CommonControls und TextToStlDialog", () => {
    const controlsHtml = renderToStaticMarkup(
      <div>
        <SaveExportButton path="/tmp/test.stl" label="STL speichern" />
        <NumberField label="Breite" tooltip="Tooltip" value={100} unit="mm" min={20} max={300} step={1} setValue={vi.fn()} />
      </div>
    );
    expect(controlsHtml).toContain("STL speichern");
    expect(controlsHtml).toContain("Breite");

    const dialogHtml = renderToStaticMarkup(
      <TextToStlDialog close={vi.fn()} create={vi.fn()} />
    );
    expect(dialogHtml).toContain("Schrift zu STL");
    expect(dialogHtml).toContain("Mein Text");
  });

  it("rendert Relief-Vorschau-Karten und Settings", () => {
    const placeholderHtml = renderToStaticMarkup(<ReliefPreviewPlaceholder />);
    expect(placeholderHtml).toContain("Dein Modell erscheint hier");

    const loadingHtml = renderToStaticMarkup(
      <ReliefLoadingPreview
        progress={{ phase: "Höhen berechnen", detail: "Oberflächen werden aufgebaut …", progress: 42 }}
        onCancel={vi.fn()}
      />
    );
    expect(loadingHtml).toContain("42 %");
    expect(loadingHtml).toContain("Höhen berechnen");

    const mockResult = {
      stlPath: "/tmp/test.stl",
      threeMfPath: "/tmp/test.3mf",
      vertexCount: 1000,
      triangleCount: 2000,
      widthMm: 100,
      heightMm: 80,
      options: {
        sourceName: "test.png",
        widthMm: 100,
        baseMm: 1.6,
        reliefMm: 4,
        resolution: 256,
        invert: false,
        profile: "balanced",
        smoothing: 2,
        detail: 1,
        processingMode: "auto",
        pipelineKind: "auto",
        includeBackground: false,
        nozzleMm: 0.4,
        minimumFeatureMm: 0.8,
        sourceColors: [],
        colors: [],
        colorMapping: [],
        sideColorIndex: 0,
        outputMode: "relief",
        shape: "source",
        borderMm: 0,
        borderHeightMm: 0,
        holeDiameterMm: 0,
        holePosition: "top-center",
        curveAngle: 0,
        mirrorX: false
      },
      printability: {
        score: 95,
        status: "ready",
        issues: ["Keine offensichtlichen Druckprobleme erkannt."],
        estimatedVolumeCm3: 12.4,
        checks: [{ label: "Übergänge", status: "ok", detail: "Druckfreundlich" }]
      },
      geometryValidation: {
        valid: true,
        errors: [],
        warnings: [],
        stats: {
          boundaryEdges: 0,
          nonManifoldEdges: 0,
          degenerateTriangles: 0,
          invalidTriangles: 0,
          duplicateTriangles: 0,
          connectedComponents: 1
        }
      },
      contourQuality: {
        score: 92,
        shortEdgeRatio: 0.02,
        sliverTriangleRatio: 0.01,
        edgeLengthVariation: 0.1
      },
      fileBytes: { stl: 100084, threeMf: 48000 },
      slicer: {
        layerHeightMm: 0.2,
        layerCount: 28,
        estimatedMinutes: 35,
        filamentMeters: 4.1,
        materialGrams: 15.3,
        colorChanges: 0
      },
      heightmapDataUrl: "data:image/png;base64,AA==",
      preview: { positions: [0, 0, 0], indices: [0, 0, 0], colorParts: [] },
      colorRegions: []
    } satisfies NonNullable<ReliefResult>;

    const resultCardHtml = renderToStaticMarkup(
      <ReliefResultCard result={mockResult} optimize={vi.fn()} />
    );
    expect(resultCardHtml).toContain("Druckscore 95/100");
    expect(resultCardHtml).toContain("Hervorragendes Modell");

    const slicerHtml = renderToStaticMarkup(<SlicerAnalysisCard result={mockResult} />);
    expect(slicerHtml).toContain("Lokale Druckschätzung");
    expect(slicerHtml).toContain("28");

    const settingsHtml = renderToStaticMarkup(<Settings />);
    expect(settingsHtml).toContain("OpenAI · Prompt zu 3D");
    expect(settingsHtml).toContain("Lokale Relief-Engine");
    expect(isExcellentReliefResult(mockResult)).toBe(true);
  });

  it("berechnet Formatierungs- und Farbhilfsfunktionen korrekt", () => {
    expect(darkestColorIndex(["#ffffff", "#112233", "#cccccc"])).toBe(1);
    expect(formatStorage(2_500_000_000)).toContain("2,5");
    expect(formatApiCost(0.0042)).toContain("0,0042");
  });
});
