/// <reference types="vite/client" />

interface Window {
  desktop?: {
    getVersion: () => Promise<string>;
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
    }) => Promise<{
      stlPath: string;
      threeMfPath: string;
      vertexCount: number;
      triangleCount: number;
      widthMm: number;
      heightMm: number;
      preview: {
        positions: number[];
        indices: number[];
      };
    } | null>;
    showItemInFolder: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
}
