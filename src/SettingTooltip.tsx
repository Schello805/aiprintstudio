import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export function SettingTooltip({ text }: { text: string }) {
  const [explanation, example] = text.split("\n");
  const trigger = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const show = () => {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = 280;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, bounds.left + bounds.width / 2 - width / 2));
    const below = bounds.top < 150;
    setPosition({ left, top: below ? bounds.bottom + 9 : bounds.top - 9, below });
  };
  return (
    <span
      ref={trigger}
      className="tooltip-trigger"
      tabIndex={0}
      aria-label={`${explanation}${example ? ` ${example}` : ""}`}
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={show}
      onMouseLeave={() => setPosition(null)}
      onFocus={show}
      onBlur={() => setPosition(null)}
    >
      <span className="tooltip-i" aria-hidden="true">i</span>
      {position && createPortal(
        <span
          className={`setting-tooltip floating-tooltip${position.below ? " below" : ""}`}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
        >
          <span>{explanation}</span>
          {example && <em>{example}</em>}
        </span>,
        document.body
      )}
    </span>
  );
}
