/// <reference types="vite/client" />

interface Window {
  desktop?: {
    getVersion: () => Promise<string>;
    checkForUpdate: () => Promise<{ currentVersion: string; latestVersion: string; available: boolean; url: string }>;
    getSettingsStatus: () => Promise<{
      openAiConfigured: boolean;
      modelSetupAccepted: boolean;
      encryptionAvailable: boolean;
      storageVersion: number;
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
      dataUrl: string;
    } | null>;
    createRelief: (imagePath: string, options: {
      widthMm: number;
      baseMm: number;
      reliefMm: number;
      resolution: number;
      invert: boolean;
      profile: "fast" | "balanced" | "fine" | "photo" | "logo";
      smoothing: number;
      detail: number;
    }) => Promise<{
      stlPath: string;
      threeMfPath: string;
      vertexCount: number;
      triangleCount: number;
      widthMm: number;
      heightMm: number;
      options: {
        widthMm: number; baseMm: number; reliefMm: number; resolution: number; invert: boolean;
        profile: "fast" | "balanced" | "fine" | "photo" | "logo"; smoothing: number; detail: number;
      };
      printability: { score: number; status: "ready" | "warning" | "critical"; issues: string[]; estimatedVolumeCm3: number };
      heightmapDataUrl: string;
      preview: {
        positions: number[];
        indices: number[];
      };
    } | null>;
    showItemInFolder: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
}
