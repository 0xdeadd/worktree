"use client";
import React from "react";

// Renders our tiny markup: paragraphs (\n\n), `inline code`, **bold**.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // split on `code` and **bold**, keeping the delimiters
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={`${keyBase}-c${i}`}>{tok.slice(1, -1)}</code>);
    else out.push(<strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Prose({ text, className = "" }: { text: string; className?: string }) {
  const paras = text.split("\n\n");
  return (
    <div className={`prose-paper ${className}`}>
      {paras.map((p, i) => (
        <p key={i} className={i > 0 ? "mt-3" : ""}>
          {renderInline(p, `p${i}`)}
        </p>
      ))}
    </div>
  );
}

export function Inline({ text }: { text: string }) {
  return <span className="prose-paper">{renderInline(text, "il")}</span>;
}
