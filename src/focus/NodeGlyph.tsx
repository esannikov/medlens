import type { LensNode } from "./model.ts";

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
}: {
  kind: LensNode["kind"];
  color?: string;
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
    </svg>
  );
}
