import { Save } from "lucide-react";
import { useState } from "react";
import { SettingTooltip } from "../SettingTooltip";

export function SaveExportButton({ path, label }: { path: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const save = async () => {
    if (!window.desktop || busy) return;
    setBusy(true);
    setStatus("idle");
    try {
      const savedPath = await window.desktop.saveGeneratedFile(path);
      if (savedPath) setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className={`secondary-button export-save-button ${status}`}
      onClick={() => void save()}
      disabled={busy}
      title={status === "saved" ? "Gespeichert – erneut klicken, um einen anderen Speicherort zu wählen." : undefined}
    >
      <Save size={14} />
      {busy ? "Speichern …" : status === "saved" ? `${label} gespeichert` : status === "error" ? "Erneut versuchen" : label}
    </button>
  );
}

export function NumberField({
  label,
  tooltip,
  value,
  unit,
  min,
  max,
  step,
  setValue
}: {
  label: string;
  tooltip: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step: number;
  setValue: (value: number) => void;
}) {
  return (
    <label className="number-field has-tooltip">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-description={tooltip}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setValue(Math.max(min, Math.min(max, Number(event.target.value))))}
        />
        {unit && <small>{unit}</small>}
      </div>
      <SettingTooltip text={tooltip} />
    </label>
  );
}
