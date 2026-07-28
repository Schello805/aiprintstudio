export type SystemCheckInput = {
  platform: NodeJS.Platform;
  architecture: string;
  macOsVersion: string;
  totalMemoryBytes: number;
  freeDiskBytes: number;
  depthModelAvailable: boolean;
  objectCaptureAvailable: boolean;
};

export type SystemCheckResult = {
  supported: boolean;
  errors: string[];
  warnings: string[];
};

const gibibyte = 1024 ** 3;

function majorVersion(version: string): number {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : 0;
}

export function checkSystemCompatibility(input: SystemCheckInput): SystemCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.platform !== "darwin") errors.push("AI Print Studio ist derzeit nur für macOS verfügbar.");
  if (input.architecture !== "arm64") errors.push("Benötigt wird ein Mac mit Apple Silicon (M1 oder neuer). Intel-Macs werden nicht unterstützt.");
  if (majorVersion(input.macOsVersion) < 13) errors.push("Benötigt wird macOS 13 Ventura oder neuer.");
  if (input.totalMemoryBytes < 8 * gibibyte) warnings.push("Weniger als 8 GB Arbeitsspeicher: große Modelle und KI-Tiefe können langsam oder instabil sein.");
  if (input.freeDiskBytes < 4 * gibibyte) warnings.push("Weniger als 4 GB freier Speicher: Exporte und Mehrfoto-Scans können fehlschlagen.");
  if (!input.depthModelAvailable) warnings.push("Das lokale KI-Tiefenmodell fehlt. „Foto & 3D-Tiefe“ ist in diesem Build nicht verfügbar.");
  if (!input.objectCaptureAvailable) warnings.push("Die lokale Object-Capture-Komponente fehlt. Mehrfoto-Scans sind in diesem Build nicht verfügbar.");

  return { supported: errors.length === 0, errors, warnings };
}

