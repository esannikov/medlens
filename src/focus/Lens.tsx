import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  clampDisk,
  focusPoint,
  lerpVec,
  norm,
  type LensModel,
  type Scope,
  type Vec,
} from "./model.ts";
import {
  lensGeometry,
  nodeKinds,
  placeLabels,
  preview,
  type Measure,
} from "./layout.ts";
import { NodeGlyph, NodeShape } from "./NodeGlyph";

export function Lens({
  lm,
  selected,
  pinned,
  scope,
  centerKey,
  onSelect,
  onRead,
  onFocusChange,
}: {
  lm: LensModel;
  selected: string;
  pinned: string | null;
  scope: Scope;
  centerKey: number;
  onSelect: (id: string) => void;
  onRead: (id: string) => void;
  onFocusChange: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; focus: Vec; moved: boolean } | null>(
      null,
    ),
    frame = useRef(0);
  const volumeId = `lens-volume-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [focus, setFocus] = useState<Vec>(() => lm.nodes.get(selected)!.p2),
    currentFocus = useRef(focus);
  const [zoom, setZoom] = useState(1),
    [moving, setMoving] = useState(false),
    [hovered, setHovered] = useState<string | null>(null);
  const measure = useMemo<Measure>(() => {
    const context = document.createElement("canvas").getContext("2d")!;
    return (text, font) => {
      context.font = font;
      return context.measureText(text).width;
    };
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setSize({
        width: Math.max(1, e.contentRect.width),
        height: Math.max(1, e.contentRect.height),
      }),
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const from = currentFocus.current,
      target = lm.nodes.get(selected)!.p2;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (norm(focusPoint(target, from)) < 1e-6 || reduced) {
      currentFocus.current = target;
      setFocus(target);
      setMoving(false);
      return;
    }
    setHovered(null);
    setMoving(true);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 420),
        p = lerpVec(from, target, 1 - (1 - t) ** 4);
      currentFocus.current = p;
      setFocus(p);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setMoving(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [selected, centerKey, lm]);
  const geometry = useMemo(
    () =>
      lensGeometry(lm, selected, scope, focus, size.width, size.height, zoom),
    [lm, selected, scope, focus, size, zoom],
  );
  const { points, paths, radius, centerId } = geometry;
  const labels = useMemo(
    () =>
      placeLabels(
        lm,
        selected,
        scope,
        points,
        paths,
        size.width,
        size.height,
        measure,
      ),
    [lm, selected, scope, points, paths, size, measure],
  );
  useEffect(() => onFocusChange(centerId), [centerId, onFocusChange]);
  const hoverNode = hovered ? lm.nodes.get(hovered) : null;
  const focusNode = lm.nodes.get(centerId)!,
    selectedNode = lm.nodes.get(selected)!,
    info = preview(lm, focusNode, scope);
  const offCenter = norm(focusPoint(selectedNode.p2, focus)) > 0.12;
  const highlighted = new Set(
    lm.ancestors(hovered || centerId).map((n) => n.id),
  );
  const choose = (id: string) => {
    if (!drag.current?.moved) {
      if (id === selected) onRead(id);
      else onSelect(id);
    }
  };
  const recenter = () => {
    cancelAnimationFrame(frame.current);
    currentFocus.current = selectedNode.p2;
    setFocus(selectedNode.p2);
    setZoom(1);
    setMoving(false);
    setHovered(null);
  };
  return (
    <section className="lens-view" aria-label="Лінза досьє">
      <div className="lens-orientation">
        <div data-focus-caption={centerId}>
          <NodeGlyph kind={focusNode.kind} color={focusNode.color} />
          <span className="focus-caption-text">
            <strong title={focusNode.title}>У фокусі: {focusNode.title}</strong>
            <span>
              {info.kind} · {info.content}
              {info.time ? ` · ${info.time}` : ""}
            </span>
          </span>
        </div>
        <button onClick={() => onRead(centerId)}>
          {focusNode.children.length ? "Відкрити вміст" : "Читати запис"}
        </button>
      </div>
      <div className="lens" ref={host} data-lens-mode="2d" data-moving={moving}>
        <svg
          className="lens-svg"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-label="Інтерактивна 2D-лінза графа"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            cancelAnimationFrame(frame.current);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              focus: currentFocus.current,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !e.buttons) return;
            if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5)
              d.moved = true;
            if (d.moved) {
              setMoving(true);
              setHovered(null);
              e.currentTarget.setPointerCapture(e.pointerId);
              const delta = clampDisk(
                [-(e.clientX - d.x) / radius, (e.clientY - d.y) / radius],
                0.85,
              );
              const next = clampDisk(
                focusPoint(delta, d.focus.map((v) => -v) as Vec),
              );
              currentFocus.current = next;
              setFocus(next);
            }
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            setMoving(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setMoving(false);
          }}
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) recenter();
          }}
        >
          <defs>
            <radialGradient id={volumeId} cx="36%" cy="26%" r="78%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="53%" stopColor="#faf8fd" />
              <stop offset="84%" stopColor="#f2edf8" />
              <stop offset="100%" stopColor="#eae3f2" />
            </radialGradient>
            <radialGradient id={`${volumeId}-rim`}>
              <stop offset="83%" stopColor="#857398" stopOpacity="0" />
              <stop offset="100%" stopColor="#857398" stopOpacity="0.055" />
            </radialGradient>
          </defs>
          <circle
            className="lens-boundary"
            cx={size.width / 2}
            cy={size.height / 2}
            r={radius}
            fill={`url(#${volumeId})`}
            stroke="#ddd4e9"
            strokeWidth="1"
            pointerEvents="none"
          />
          <circle
            cx={size.width / 2}
            cy={size.height / 2}
            r={radius}
            fill={`url(#${volumeId}-rim)`}
            pointerEvents="none"
          />
          <g fill="none">
            {paths.map((path) => {
              const both =
                highlighted.has(path.source) && highlighted.has(path.target);
              return (
                <path
                  key={path.target}
                  data-graph-edge={path.target}
                  d={path.points
                    .map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`)
                    .join(" ")}
                  stroke={lm.nodes.get(path.target)!.color}
                  strokeWidth={both ? 1.35 : path.local ? 0.85 : 0.65}
                  opacity={both ? 0.8 : path.local ? 0.43 : 0.28}
                  strokeDasharray={path.grouping ? "3 4" : undefined}
                />
              );
            })}
          </g>
          <g>
            {points.map((p) => {
              const hasLabel = labels.some((b) => b.id === p.id);
              const n = lm.nodes.get(p.id)!,
                expanded = p.detail,
                chosen = p.id === selected,
                hot = p.id === hovered,
                content = preview(lm, n, scope);
              const visible =
                p.x >= 0 && p.x <= size.width && p.y >= 0 && p.y <= size.height;
              return (
                <g
                  key={p.id}
                  data-lens-node={p.id}
                  data-node-kind={n.kind}
                  data-detail={expanded}
                  className="node-target"
                  transform={`translate(${p.x} ${p.y})`}
                  onClick={() => choose(p.id)}
                  onMouseEnter={() => !moving && setHovered(p.id)}
                  onMouseLeave={() => setHovered(null)}
                  role="button"
                  tabIndex={-1}
                  aria-label={`${content.kind}: ${n.title}. ${content.content}. ${content.action}`}
                  aria-hidden={!visible || hasLabel}
                >
                  <circle
                    r={expanded ? Math.max(14, p.radius + 4) : p.radius + 2}
                    fill="transparent"
                  />
                  {(chosen || hot || p.id === pinned || p.id === centerId) && (
                    <circle
                      r={p.radius + 5}
                      fill="none"
                      stroke={
                        p.id === pinned
                          ? "#b08437"
                          : chosen
                            ? "#6750a4"
                            : "#2a7b79"
                      }
                      strokeWidth={chosen ? 1.7 : 1}
                    />
                  )}
                  <g
                    data-node-mark="true"
                    opacity={p.active ? (expanded ? 1 : 0.68) : 0.14}
                  >
                    {expanded ? (
                      <NodeShape
                        kind={n.kind}
                        r={p.radius}
                        fill={n.kind === "specimen" ? "#fffbfe" : n.color}
                        stroke={n.color}
                      />
                    ) : (
                      <circle r={p.radius} fill={n.color} />
                    )}
                    {expanded &&
                      (n.kind === "group" || n.kind === "patient") && (
                        <circle
                          r={p.radius * 0.48}
                          fill="none"
                          stroke="#fffbfe"
                          strokeWidth="1.2"
                        />
                      )}
                    {expanded && n.kind === "clinical_event" && (
                      <path
                        d={`M${-p.radius * 0.42} -2h${p.radius * 0.84}m-${p.radius * 0.84} 4h${p.radius * 0.6}`}
                        fill="none"
                        stroke="#fff"
                        strokeWidth="1.2"
                      />
                    )}
                  </g>
                </g>
              );
            })}
          </g>
          <g className="lens-labels">
            {labels.map((b) => {
              const n = lm.nodes.get(b.id)!,
                content = preview(lm, n, scope);
              return (
                <g
                  key={b.id}
                  className={`lens-label ${b.id === selected ? "selected" : ""} ${b.id === centerId ? "centered" : ""}`}
                  role="button"
                  tabIndex={0}
                  data-label-for={b.id}
                  data-label-distance={b.distance}
                  aria-label={`${content.kind}: ${n.title}. ${content.content}. ${content.time}. ${content.action}`}
                  onClick={() => choose(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (b.id === selected) onRead(b.id);
                      else onSelect(b.id);
                    }
                  }}
                  onMouseEnter={() => setHovered(b.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(b.id)}
                  onBlur={() => setHovered(null)}
                >
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    fill="transparent"
                    className="label-hit-area"
                    aria-hidden="true"
                  />
                  {b.meta && (
                    <text
                      x={b.x + 4}
                      y={b.y + b.metaY}
                      fontSize={b.metaSize}
                      fill="#716878"
                    >
                      {b.meta}
                    </text>
                  )}
                  <text
                    x={b.x + 4}
                    y={b.y + b.titleY}
                    fontSize={b.titleSize}
                    fontWeight={b.weight}
                    className="lens-title"
                    fill="#302b39"
                  >
                    {b.lines.map((line, i) => (
                      <tspan key={i} x={b.x + 4} dy={i ? b.titleLineHeight : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {b.dateLines.length > 0 && (
                    <text
                      className="lens-date"
                      x={b.x + 4}
                      y={b.y + b.dateY}
                      fontSize={b.metaSize}
                      fill="#655c70"
                    >
                      {b.dateLines.map((line, i) => (
                        <tspan
                          key={i}
                          x={b.x + 4}
                          dy={i ? b.dateLineHeight : 0}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                  <text
                    x={b.x + 4}
                    y={b.y + b.detailY}
                    fontSize={b.detailSize}
                    fill={n.color}
                  >
                    {b.content}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {hoverNode && hovered !== selected && !moving && (
          <div className="lens-peek" role="status">
            <NodeGlyph kind={hoverNode.kind} color={hoverNode.color} />
            <span>
              <strong>
                {nodeKinds[hoverNode.kind]} ·{" "}
                {preview(lm, hoverNode, scope).action}
              </strong>
              <span>{hoverNode.title}</span>
            </span>
          </div>
        )}
        <div className="lens-zoom">
          <button
            aria-label="Зменшити лінзу"
            onClick={() => setZoom((z) => Math.max(0.65, z - 0.15))}
          >
            −
          </button>
          <button
            onClick={recenter}
            className={offCenter ? "return-focus" : ""}
          >
            {offCenter ? "До вибраного" : "Вписати"}
          </button>
          <button
            aria-label="Збільшити лінзу"
            onClick={() => setZoom((z) => Math.min(1.65, z + 0.15))}
          >
            +
          </button>
        </div>
      </div>
      <div className="lens-key" aria-label="Позначення вузлів">
        {(
          ["clinical_event", "specimen", "observation", "finding"] as const
        ).map((kind) => (
          <span key={kind}>
            <NodeGlyph kind={kind} />
            {nodeKinds[kind]}
          </span>
        ))}
        <span className="lens-key-context">
          Дрібні точки — згорнутий контекст
        </span>
      </div>
    </section>
  );
}
