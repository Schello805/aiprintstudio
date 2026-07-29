/// <reference types="vite/client" />

interface Window {
  desktop?: {
    getVersion: () => Promise<string>;
    getAppMetrics: () => Promise<{
      cpuPercent: number;
      ramMb: number;
      totalMemoryMb: number;
      processCount: number;
    }>;
    checkForUpdate: () => Promise<{ currentVersion: string; latestVersion: string; available: boolean; url: string; directDownload: boolean }>;
    getSettingsStatus: () => Promise<{
      openAiConfigured: boolean;
      openAiStored: boolean;
      modelSetupAccepted: boolean;
      storageVersion: number;
      depthModelAvailable: boolean;
    }>;
    saveOpenAiKey: (apiKey: string, password: string) => Promise<void>;
    unlockOpenAiKey: (password: string) => Promise<void>;
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
    saveProject: (project: unknown) => Promise<string | null>;
    openProject: () => Promise<unknown | null>;
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
    getAi3dModels: () => Promise<Array<{
      id: "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna";
      name: string;
      role: string;
      description: string;
      inputUsdPerMillion: number;
      cachedInputUsdPerMillion: number;
      outputUsdPerMillion: number;
      typicalCostEur: number;
    }>>;
    getLastAi3dDiagnostic: () => Promise<{
      id: string;
      timestamp: string;
      stage: string;
      model: string;
      elapsedMs: number;
      message: string;
      technicalCause: string;
      logPath: string;
    } | null>;
    createAi3d: (prompt: string, existingPlan?: {
      title: string; widthMm: number; depthMm: number; heightMm: number;
      primitives: Array<{ type: "box" | "cylinder" | "roof"; name: string; position: [number, number, number]; size: [number, number, number] }>;
    }, model?: "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna") => Promise<{
      stlPath: string;
      plan: {
        title: string; widthMm: number; depthMm: number; heightMm: number;
        primitives: Array<{ type: "box" | "cylinder" | "roof"; name: string; position: [number, number, number]; size: [number, number, number] }>;
      };
      billing: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        estimatedCostEur: number;
      };
    }>;
    onAi3dProgress: (callback: (progress: {
      phase: string;
      progress: number;
      estimatedCostEur: number;
      exactTokenUsage: boolean;
      inputTokens: number;
      outputTokens: number;
    }) => void) => () => void;
    getComplex3dStatus: () => Promise<{
      id: string; name: string; version: string; sizeBytes: number; requiredFreeBytes: number;
      sourceUrl: string; licenseUrl: string; codeUrl: string; weightsSha256: string; notice: string;
      installed: boolean; workerAvailable: boolean; accepted: boolean; acceptedAt: string | null; installedBytes: number;
    }>;
    acceptComplex3dLicense: (accepted: boolean) => Promise<unknown>;
    downloadComplex3dModel: (jobId: string) => Promise<unknown>;
    removeComplex3dModel: () => Promise<unknown>;
    createComplex3dReference: (prompt: string) => Promise<{ path: string; dataUrl: string; disclaimer: string }>;
    createComplex3dMesh: (jobId: string, imagePath: string) => Promise<{
      stlPath: string; triangleCount: number; preview: { positions: number[]; indices: number[] };
    }>;
    cancelComplex3d: (jobId: string) => Promise<boolean>;
    onComplex3dProgress: (callback: (jobId: string, progress: {
      phase: string; progress: number; loadedBytes: number; totalBytes: number;
    }) => void) => () => void;
    createRelief: (jobId: string, imagePath: string, options: {
      widthMm: number;
      baseMm: number;
      reliefMm: number;
      resolution: number;
      invert: boolean;
      profile: "fast" | "balanced" | "fine" | "photo" | "logo";
      smoothing: number;
      detail: number;
      processingMode: "auto" | "vector" | "wordmark" | "depth" | "height";
      includeBackground: boolean;
      nozzleMm: number;
      minimumFeatureMm: number;
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
        processingMode: "auto" | "vector" | "wordmark" | "depth" | "height";
        includeBackground: boolean;
        nozzleMm: number;
        minimumFeatureMm: number;
        sourceColors: string[];
        colors: string[];
        sideColorIndex: number;
      };
      printability: { score: number; status: "ready" | "warning" | "critical"; issues: string[]; estimatedVolumeCm3: number; checks: Array<{ label: string; status: "ok" | "warning" | "error"; detail: string }> };
      slicer: { layerHeightMm: number; layerCount: number; estimatedMinutes: number; filamentMeters: number; materialGrams: number; colorChanges: number };
      heightmapDataUrl: string;
      preview: {
        positions: number[];
        indices: number[];
        colorParts: Array<{ color: string; indices: number[] }>;
      };
    } | null>;
    cancelRelief: (jobId: string) => Promise<boolean>;
    onReliefProgress: (callback: (jobId: string, progress: {
      phase: string;
      detail: string;
      progress: number;
    }) => void) => () => void;
    showItemInFolder: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
}
