export function SettingTooltip({ text }: { text: string }) {
  const [explanation, example] = text.split("\n");
  return (
    <span className="setting-tooltip" role="tooltip" aria-hidden="true">
      <span>{explanation}</span>
      {example && <em>{example}</em>}
    </span>
  );
}
