/// <reference types="vite/client" />

interface Window {
  desktop?: {
    getVersion: () => Promise<string>;
    getSettingsStatus: () => Promise<{
      openAiConfigured: boolean;
      modelSetupAccepted: boolean;
      encryptionAvailable: boolean;
    }>;
    saveOpenAiKey: (apiKey: string) => Promise<void>;
    removeOpenAiKey: () => Promise<void>;
    acceptModelSetup: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
}
