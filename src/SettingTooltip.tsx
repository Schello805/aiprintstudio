export function SettingTooltip({ text }: { text: string }) {
  const [explanation, example] = text.split("\n");
  return (
    <span
      className="tooltip-trigger"
      tabIndex={0}
      aria-label={`${explanation}${example ? ` ${example}` : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="tooltip-i" aria-hidden="true">i</span>
      <span className="setting-tooltip" role="tooltip">
        <span>{explanation}</span>
        {example && <em>{example}</em>}
      </span>
    </span>
  );
}
