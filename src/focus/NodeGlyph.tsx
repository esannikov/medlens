import type { LensNode } from "./model.ts";

/** Study marks retain their source category at the perimeter of the lens. */
export function StudyMark({ eventKind, r, color = "#fff" }: { eventKind?: string; r: number; color?: string }) {
  const a = r * 0.48;
  const common = { fill: "none", stroke: color, strokeWidth: Math.max(0.8, r * 0.12), strokeLinecap: "round" as const };
  if (eventKind === "imaging_study") return <g {...common}><circle r={a} /><path d={`M${-a * 1.4} 0h${a * 2.8}M0 ${-a * 1.4}v${a * 2.8}`} /></g>;
  if (eventKind === "pathology_procedure") return <g {...common}><circle cx={-a * 0.45} cy={-a * 0.3} r={a * 0.62} /><circle cx={a * 0.55} cy={a * 0.4} r={a * 0.55} /></g>;
  return <path d={`M${-a} ${-a}h${a * 2}M${-a} 0h${a * 2}M${-a} ${a}h${a * 1.4}`} {...common} />;
}

export function NodeShape({
  kind,
  r,
  fill = "currentColor",
  stroke = "none",
  strokeWidth = 1.5,
}: {
  kind: LensNode["kind"];
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const props = { fill, stroke, strokeWidth };
  if (kind === "clinical_event")
    return (
      <rect
        x={-r}
        y={-r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.28}
        {...props}
      />
    );
  if (kind === "specimen")
    return (
      <rect
        x={-r * 0.65}
        y={-r}
        width={r * 1.3}
        height={r * 2}
        rx={r * 0.58}
        {...props}
      />
    );
  if (kind === "finding")
    return <path d={`M0 ${-r} ${r} 0 0 ${r} ${-r} 0Z`} {...props} />;
  if (kind === "temporal_relation")
    return (
      <path
        d={`M${-r} 0 -${r * 0.35} ${-r * 0.75} ${r} 0 ${r * 0.35} ${r * 0.75}Z`}
        {...props}
      />
    );
  return <circle r={r} {...props} />;
}
export function NodeGlyph({
  kind,
  color = "currentColor",
  eventKind,
}: {
  kind: LensNode["kind"];
  color?: string;
  eventKind?: string;
}) {
  return (
    <svg
      className="node-glyph"
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="-10 -10 20 20"
      style={{ color }}
    >
      <NodeShape
        kind={kind}
        r={6.5}
        fill={kind === "group" || kind === "patient" ? "none" : color}
        stroke={color}
      />
      {(kind === "patient" || kind === "group") && (
        <circle r="2.5" fill={color} />
      )}
      {kind === "clinical_event" && eventKind && <StudyMark eventKind={eventKind} r={6.5} />}
    </svg>
  );
}
