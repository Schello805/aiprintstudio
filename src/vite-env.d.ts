/// <reference types="vite/client" />

interface Window {
  desktop?: {
    getVersion: () => Promise<string>;
    checkForUpdate: () => Promise<{ currentVersion: string; latestVersion: string; available: boolean; url: string; directDownload: boolean }>;
    getSettingsStatus: () => Promise<{
      openAiConfigured: boolean;
      modelSetupAccepted: boolean;
      sessionOnly: boolean;
      storageVersion: number;
      depthModelAvailable: boolean;
    }>;
    saveOpenAiKey: (apiKey: string) => Promise<void>;
    removeOpenAiKey: () => Promise<void>;
    acceptModelSetup: () => Promise<void>;
    selectImage: () => Promise<{
      path: string;
      name: string;
      size: number;
      width: number;
      height: number;
      suggestedProfile: "logo" | "photo";
      dataUrl: string;
    } | null>;
    createTextImage: (options: {
      text: string;
      fontFamily: string;
      bold: boolean;
      italic: boolean;
      alignment: "left" | "center" | "right";
    }) => Promise<{
      path: string;
      name: string;
      size: number;
      width: number;
      height: number;
      suggestedProfile: "logo";
      dataUrl: string;
    }>;
    createAi3d: (prompt: string, existingPlan?: {
      title: string; widthMm: number; depthMm: number; heightMm: number;
      primitives: Array<{ type: "box" | "cylinder" | "roof"; name: string; position: [number, number, number]; size: [number, number, number] }>;
    }) => Promise<{
      stlPath: string;
      plan: {
        title: string; widthMm: number; depthMm: number; heightMm: number;
        primitives: Array<{ type: "box" | "cylinder" | "roof"; name: string; position: [number, number, number]; size: [number, number, number] }>;
      };
    }>;
    createObjectCapture: () => Promise<{ usdzPath: string; photoCount: number } | null>;
    createRelief: (imagePath: string, options: {
      widthMm: number;
      baseMm: number;
      reliefMm: number;
      resolution: number;
      invert: boolean;
      profile: "fast" | "balanced" | "fine" | "photo" | "logo";
      smoothing: number;
      detail: number;
      processingMode: "auto" | "vector" | "depth" | "height";
      sourceColors: string[];
      colors: string[];
      sideColorIndex: number;
    }, editorHeightmapDataUrl?: string, editorColorMapDataUrl?: string) => Promise<{
      stlPath: string;
      threeMfPath: string;
      vertexCount: number;
      triangleCount: number;
      widthMm: number;
      heightMm: number;
      options: {
        widthMm: number; baseMm: number; reliefMm: number; resolution: number; invert: boolean;
        profile: "fast" | "balanced" | "fine" | "photo" | "logo"; smoothing: number; detail: number;
        processingMode: "auto" | "vector" | "depth" | "height";
        sourceColors: string[];
        colors: string[];
        sideColorIndex: number;
      };
      printability: { score: number; status: "ready" | "warning" | "critical"; issues: string[]; estimatedVolumeCm3: number; checks: Array<{ label: string; status: "ok" | "warning" | "error"; detail: string }> };
      heightmapDataUrl: string;
      preview: {
        positions: number[];
        indices: number[];
        colorParts: Array<{ color: string; indices: number[] }>;
      };
    } | null>;
    showItemInFolder: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
}
