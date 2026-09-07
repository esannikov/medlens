import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  clampDisk,
  focusPoint,
  geodesic,
  lerpVec,
  norm,
  type LensModel,
  type Scope,
  type Vec,
} from "./model.ts";
import {
  lensGeometry,
  activeResultCoverage,
  exactStructuralEdges,
  keyboardDestination,
  structuralRelationNames,
  graphCaption,
  overlaps,
  connectionStyle,
  nodeKinds,
  placeLabels,
  preview,
  type Measure,
  type Label,
} from "./layout.ts";
import { NodeGlyph, NodeShape, StudyMark } from "./NodeGlyph";
import { LENS_FONT_FAMILY } from "./typography.ts";
import "./lens-upgrades.css";
import {compassLayout} from './compass.ts';
import {Compass} from './OrbitalCompass';

export function Lens({
  lm,
  selected,
  pinned,
  scope,
  centerKey,
  onSelect,
  onNavigate,
  onRead,
  onFocusChange,
  fontFamily = LENS_FONT_FAMILY,
  textScale = 1,
  canonicalUnits = false,
  showRelations = false,
  sourceTrace = false,
  cameraTarget,
  onReadSource,
  readerOpen=false,
}: {
  lm: LensModel;
  selected: string;
  pinned: string | null;
  scope: Scope;
  centerKey: number;
  onSelect: (id: string) => void;
  onNavigate?: (id: string) => void;
  onRead: (id: string) => void;
  onFocusChange: (id: string) => void;
  fontFamily?: string;
  textScale?: number;
  canonicalUnits?: boolean;
  showRelations?: boolean;
  sourceTrace?: boolean;
  cameraTarget?: string;
  onReadSource?: (id: string) => void;
  readerOpen?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; focus: Vec; moved: boolean } | null>(
      null,
    ),
    frame = useRef(0);
  const volumeId = `lens-volume-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const labelMemory = useRef(new Map<string, Label>());
  const compassMemory=useRef(new Map<string,number>());
  const svg = useRef<SVGSVGElement>(null);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const glint = useRef<SVGGElement>(null);
  const glintAnimation = useRef<Animation | null>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [focus, setFocus] = useState<Vec>(() => lm.nodes.get(selected)!.p2),
    currentFocus = useRef(focus);
  const [zoom, setZoom] = useState(1),
    [moving, setMoving] = useState(false),
    [hovered, setHovered] = useState<string | null>(null);
  const measure = useMemo<Measure>(() => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.fontKerning = "none";
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
    drag.current = null;
    const from = currentFocus.current,
      target = lm.nodes.get(cameraTarget || selected)!.p2;
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
      else {
        // Settle a clicked destination with fresh clearance. Dragging thereafter
        // retains this anchor instead of an old, compressed peripheral slot.
        labelMemory.current.clear();
        setMoving(false);
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [selected, cameraTarget, centerKey, lm]);
  const geometry = useMemo(
    () =>
      lensGeometry(lm, selected, scope, focus, size.width, size.height, zoom),
    [lm, selected, scope, focus, size, zoom],
  );
  const { points, paths, radius, centerId } = geometry;
  const readerObstacle=readerOpen&&size.width>700?[{x:size.width-380,y:0,w:380,h:size.height}]:[];
  const compass=useMemo(()=>compassLayout(lm,scope,points,radius,size.width,size.height,measure,fontFamily,[],compassMemory.current),[lm,scope,points,radius,size,measure,fontFamily]);
  const labels = useMemo(
    () =>
      placeLabels(
        lm,
        centerId,
        scope,
        points,
        paths,
        size.width,
        size.height,
        measure,
        labelMemory.current,
        moving,
        fontFamily,
        { textScale, centerId, canonicalUnits, attentionId:hovered||undefined,
          obstacles:readerObstacle,contextObstacles:compass.items.map(item=>item.bounds) },
      ),
    // Motion flags change feedback, not geometry. Pointerup must retain the
    // last rendered placement rather than start a second, unlocked layout.
    [lm, selected, scope, points, paths, size, measure, fontFamily, textScale, centerId, canonicalUnits, hovered, readerOpen, compass],
  );
  useLayoutEffect(()=>{compassMemory.current.clear();},[size.width,size.height]);
  useLayoutEffect(()=>{compass.items.forEach(item=>compassMemory.current.set(item.id,item.angle));},[compass]);
  // Reset before committing the new layout, not in a later passive effect.
  // Otherwise closing the reader erases the anchors needed by the first drag.
  useLayoutEffect(() => { labelMemory.current.clear(); }, [lm, size.width, size.height, scope, textScale, canonicalUnits]);
  useLayoutEffect(() => {
    labels.forEach(label => labelMemory.current.set(label.id, label));
  }, [labels]);
  useEffect(() => { if (!moving || drag.current?.moved) onFocusChange(centerId); }, [centerId, moving, onFocusChange]);
  const hoverNode = hovered ? lm.nodes.get(hovered) : null;
  const focusNode = lm.nodes.get(centerId)!,
    info = preview(lm, focusNode, scope, canonicalUnits);
  const highlighted = new Set(
    lm.ancestors(hovered || centerId).map((n) => n.id),
  );
  const branchRoot = focusNode.children.length ? focusNode : lm.nodes.get(focusNode.parent || centerId)!;
  const branch = new Set(branchRoot.id === lm.root
    ? [lm.root, ...branchRoot.children] : [branchRoot.id, ...branchRoot.descendants]);
  const pointsById = new Map(points.map(p => [p.id,p]));
  const coverage = activeResultCoverage(lm, centerId, scope, labels);
  const coverageOwnerId = coverage?.owner.id;
  useEffect(() => { setCoverageOpen(false); }, [coverageOwnerId]);
  const sourceEdges = useMemo(() => sourceTrace ? exactStructuralEdges(lm, centerId, true) : [], [lm, centerId, sourceTrace]);
  const exactEdges = useMemo(() => {
    const edges = showRelations ? exactStructuralEdges(lm, centerId) : [];
    return [...new Map([...edges, ...sourceEdges].map(edge => [edge.id, edge])).values()];
  }, [lm, centerId, showRelations, sourceEdges]);
  const sourceEdgeIds = new Set(sourceEdges.map(edge => edge.id));
  const tracedNodes = new Set(sourceEdges.flatMap(edge => [edge.source, edge.target]));
  const structuralPaths = exactEdges.map(edge => {
    const from = pointsById.get(edge.source)!, to = pointsById.get(edge.target)!;
    const projected = geodesic(from.p, to.p).map(([x, y]) => [size.width / 2 + x * radius, size.height / 2 - y * radius]);
    return { ...edge, trace: sourceEdgeIds.has(edge.id), d: projected.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ") };
  });
  const paintedPaths = paths.map(path => {
    const from=pointsById.get(path.source)!, to=pointsById.get(path.target)!;
    const role = from.active && to.active && highlighted.has(path.source) && highlighted.has(path.target)
      ? "route" : from.active && to.active && branch.has(path.source) && branch.has(path.target) ? "branch" : "context";
    return {...path, role, ...connectionStyle(1-Math.min(norm(from.p),norm(to.p)),role,"balanced"),
      d:path.points.map(([x,y],i)=>`${i ? "L" : "M"}${x},${y}`).join(" ")};
  });
  const playGlint = () => {
    if (!glint.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    glintAnimation.current?.cancel();
    glintAnimation.current=glint.current.animate([
      {transform:"rotate(-16deg)",opacity:0},
      {transform:"rotate(-4deg)",opacity:0.9,offset:0.25},
      {transform:"rotate(22deg)",opacity:0},
    ],{duration:650,easing:"cubic-bezier(0.16,1,0.3,1)",fill:"none"});
  };
  useEffect(() => {
    const stop=()=>glintAnimation.current?.cancel();
    const visibility=()=>{if(document.hidden)stop();};
    document.addEventListener("visibilitychange",visibility);
    return ()=>{stop();document.removeEventListener("visibilitychange",visibility);};
  },[]);
  const choose = (id: string) => {
    if (!drag.current?.moved) {
      if (id === selected) onRead(id);
      else onSelect(id);
    }
  };
  const recenter = () => {
    cancelAnimationFrame(frame.current);
    currentFocus.current = focusNode.p2;
    setFocus(focusNode.p2);
    setZoom(1);
    setMoving(false);
    setHovered(null);
  };
  const directions = [
    { id: "parent", label: "До батьківського запису", path: "M15 6l-6 6 6 6" },
    { id: "child", label: "До першого дочірнього запису", path: "M9 6l6 6-6 6" },
    { id: "previous", label: "Попередній запис у гілці", path: "M6 15l6-6 6 6" },
    { id: "next", label: "Наступний запис у гілці", path: "M6 9l6 6 6-6" },
  ] as const;
  const navigate = (id: string, direction: typeof directions[number]["id"] | "root") => {
    const destination = keyboardDestination(lm, id, scope, direction);
    if (destination) {
      drag.current = null;
      (onNavigate || onSelect)(destination);
      svg.current?.focus({ preventScroll: true });
    }
  };
  const handleNavigation = (e: KeyboardEvent, id: string) => {
    const keyDirections = { ArrowLeft: "parent", ArrowRight: "child", ArrowUp: "previous", ArrowDown: "next", Home: "root" } as const;
    const direction = keyDirections[e.key as keyof typeof keyDirections];
    if (direction && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      navigate(id, direction);
    }
  };
  return (
    <section className="lens-view lens-upgraded" aria-label="Лінза досьє" data-focus-caption={centerId} data-text-scale={textScale} data-unit-mode={canonicalUnits ? "canonical" : "source"}>
      {info.time && !labels.find(label=>label.id===centerId)?.dateLines.length && <span className="lens-date-context">{info.time}</span>}
      <div className="lens" ref={host} data-lens-mode="2d" data-moving={moving}>
        <svg
          ref={svg}
          className="lens-svg"
          style={{fontFamily}}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          tabIndex={0}
          aria-label="Інтерактивна 2D-лінза графа"
          aria-describedby={`${volumeId}-keyboard`}
          onKeyDown={e => {
            const keyboardTarget=moving ? (cameraTarget || selected) : centerId;
            handleNavigation(e, keyboardTarget);
            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
              e.preventDefault();
              onRead(keyboardTarget);
            }
          }}
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
            if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
              d.moved = true;
              playGlint();
            }
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
            <radialGradient id={`${volumeId}-focus`}>
              <stop className="focus-tint" offset="0%" stopColor={focusNode.color} stopOpacity="0.015" />
              <stop className="focus-tint" offset="50%" stopColor={focusNode.color} stopOpacity="0.035" />
              <stop className="focus-tint" offset="78%" stopColor={focusNode.color} stopOpacity="0.085" />
              <stop className="focus-tint" offset="88%" stopColor={focusNode.color} stopOpacity="0.025" />
              <stop className="focus-tint" offset="100%" stopColor={focusNode.color} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${volumeId}-gleam`}><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset="0.48" stopColor="#fff"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
            <filter id={`${volumeId}-glow`} filterUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}><feGaussianBlur stdDeviation="1.4"/></filter>
            <marker id={`${volumeId}-edge-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M1 1l6 3-6 3" fill="none" stroke="#504165" strokeWidth="1.2" />
            </marker>
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
          <circle
            data-focus-zone="true"
            cx={size.width / 2}
            cy={size.height / 2}
            r={radius * 0.56}
            fill={`url(#${volumeId}-focus)`}
            pointerEvents="none"
            aria-hidden="true"
          />
          <g data-focus-ring="true" fill="none" pointerEvents="none" aria-hidden="true">
            <circle cx={size.width / 2} cy={size.height / 2} r={radius * 0.48}
              stroke="#9280af" strokeWidth="0.9" opacity="0.46" />
            <circle cx={size.width / 2 - 0.5} cy={size.height / 2 - 1} r={Math.max(0, radius * 0.48 - 1)}
              stroke="#ffffff" strokeWidth="1.2" opacity="0.75" />
            {[0,1,2,3].map(i => {
              const angle = i * Math.PI / 2, r = radius * 0.48;
              return <path key={i} d={`M${size.width/2 + Math.cos(angle)*(r+3)} ${size.height/2 + Math.sin(angle)*(r+3)}l${Math.cos(angle)*5} ${Math.sin(angle)*5}`}
                stroke="#9280af" strokeWidth="1.1" opacity="0.55" />;
            })}
          </g>
          <g ref={glint} data-lens-glint="true" className="lens-glint" fill="none" pointerEvents="none" aria-hidden="true">
            <path d={`M${size.width/2-radius*.48*.7071} ${size.height/2-radius*.48*.7071}A${radius*.48} ${radius*.48} 0 0 1 ${size.width/2+radius*.48*.7071} ${size.height/2-radius*.48*.7071}`}
              stroke={`url(#${volumeId}-gleam)`} strokeWidth="3.5" strokeLinecap="round" />
          </g>
          <g fill="none" filter={`url(#${volumeId}-glow)`} pointerEvents="none" aria-hidden="true">
            {paintedPaths.filter(p=>p.role!=="context").map(path=><path key={path.target} d={path.d} stroke={lm.nodes.get(path.target)!.color}
              strokeWidth={path.width+3} opacity={path.opacity*0.09} />)}
          </g>
          <g fill="none">
            {paintedPaths.map((path) => {
              return (
                <path
                  key={path.target}
                  data-graph-edge={path.target}
                  data-edge-role={path.role}
                  className="lens-connection"
                  d={path.d}
                  stroke={lm.nodes.get(path.target)!.color}
                  strokeWidth={path.width}
                  opacity={path.opacity}
                  strokeLinecap="round"
                  strokeDasharray={path.grouping ? "3 4" : undefined}
                />
              );
            })}
          </g>
          <g className="lens-structural-edges" fill="none" pointerEvents="none">
            {structuralPaths.map(path => <path key={path.id} d={path.d} data-structural-edge={path.id}
              data-structural-source={path.source} data-structural-target={path.target} data-structural-relation={path.relation}
              data-source-path={path.trace} stroke={path.trace ? "#824b16" : "#504165"} strokeWidth={path.trace ? 2 : 1.6}
              strokeDasharray={path.trace ? undefined : "8 3"} opacity="0.86" markerEnd={`url(#${volumeId}-edge-arrow)`}>
              <title>{structuralRelationNames[path.relation] || path.relation}: {lm.nodes.get(path.source)!.title} → {lm.nodes.get(path.target)!.title}</title>
            </path>)}
          </g>
          <g>
            {points.map((p) => {
              const hasLabel = labels.some((b) => b.id === p.id);
              const n = lm.nodes.get(p.id)!,
                expanded = p.detail,
                chosen = p.id === centerId,
                hot = p.id === hovered,
                content = preview(lm, n, scope, canonicalUnits);
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
                  <title>{`${content.kind}: ${n.title}. ${content.content}${content.time ? `. ${content.time}` : ""}`}</title>
                  <circle
                    r={expanded || n.kind === "clinical_event" || n.kind === "group" ? Math.max(22, p.radius + 4) : p.radius + 2}
                    fill="transparent"
                  />
                  {sourceTrace && (tracedNodes.has(p.id) || p.id === centerId) && <circle r={p.radius + 8} fill="none" stroke="#824b16" strokeWidth="1.5" data-source-node={p.id} />}
                  {(chosen || hot || p.id === pinned) && (
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
                    {p.active && (branch.has(p.id) || highlighted.has(p.id)) && expanded && <circle r={p.radius+3.5} fill={n.color} opacity="0.09" />}
                    {expanded || n.kind === "clinical_event" || n.kind === "group" ? (
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
                    {n.kind === "clinical_event" && <g data-study-kind={n.object?.payload.event_kind}><StudyMark eventKind={n.object?.payload.event_kind} r={p.radius} /></g>}
                  </g>
                </g>
              );
            })}
          </g>
          <g className="lens-labels">
            {labels.map((b) => {
              const n = lm.nodes.get(b.id)!,
                content = preview(lm, n, scope, canonicalUnits);
              return (
                <g
                  key={b.id}
                  className={`lens-label ${b.id === centerId ? "selected centered" : ""}`}
                  role="button"
                  tabIndex={0}
                  data-label-for={b.id}
                  data-label-distance={b.distance}
                  data-label-anchor={b.anchor}
                  data-label-disclosure={b.disclosure}
                  data-label-detail-level={b.detailLevel}
                  textAnchor={b.textAnchor}
                  opacity={b.opacity}
                  aria-label={`${content.kind}: ${b.lines.join(" ")}. ${content.content}. ${content.time}. ${b.disclosure ? "Розгорнути повний опис" : content.action}`}
                  onClick={() => b.disclosure && !drag.current?.moved ? onRead(b.id) : choose(b.id)}
                  onKeyDown={(e) => {
                    handleNavigation(e, b.id);
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (b.id === selected || b.disclosure) onRead(b.id);
                      else onSelect(b.id);
                    }
                  }}
                  onMouseEnter={() => !moving && setHovered(b.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(b.id)}
                  onBlur={() => setHovered(null)}
                >
                  <rect
                    x={b.x}
                    y={b.y-Math.max(0,44-b.h)/2}
                    width={b.w}
                    height={Math.max(44,b.h)}
                    fill="transparent"
                    className="label-hit-area"
                    aria-hidden="true"
                  />
                  {b.meta && (
                    <text
                      x={b.textX}
                      y={b.y + b.metaY}
                      fontSize={b.metaSize}
                      fill="#716878"
                    >
                      {b.meta}
                    </text>
                  )}
                  <text
                    x={b.textX}
                    y={b.y + b.titleY}
                    fontSize={b.titleSize}
                    fontWeight={b.weight}
                    className="lens-title"
                    fill="#302b39"
                  >
                    {b.lines.map((line, i) => (
                      <tspan key={i} x={b.textX} dy={i ? b.titleLineHeight : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {b.dateLines.length > 0 && (
                    <text
                      className="lens-date"
                      x={b.textX}
                      y={b.y + b.dateY}
                      fontSize={b.metaSize}
                      fill="#655c70"
                    >
                      {b.dateLines.map((line, i) => (
                        <tspan
                          key={i}
                          x={b.textX}
                          dy={i ? b.dateLineHeight : 0}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                  {b.contentLines.length > 0 && <text
                    x={b.textX}
                    y={b.y + b.detailY}
                    fontSize={b.detailSize}
                    fill={n.color}
                  >
                    {b.contentLines.map((line,i) => <tspan key={i} x={b.textX} dy={i ? b.detailLineHeight : 0}>{line}</tspan>)}
                  </text>}
                  {b.disclosure && <path data-disclosure-arrow={b.id} d={`M${b.x+b.w-11} ${b.y+b.titleY-8}l4 4-4 4`}
                    fill="none" stroke={n.color} strokeWidth="1.3" aria-hidden="true" pointerEvents="none" />}
                </g>
              );
            })}
          </g>
          <Compass layout={compass} active={lm.groupFor(centerId)} obscured={compass.items.filter(item=>labels.some(b=>b.id===hovered&&overlaps(b,item.bounds,3))).map(item=>item.id)} onNavigate={id=>{drag.current=null;(onNavigate||onSelect)(id);}}/>
        </svg>
        {hoverNode && !labels.some(label=>label.id===hovered) && !moving && (
          <div className="lens-peek" role="status">
            <NodeGlyph kind={hoverNode.kind} color={hoverNode.color} />
            <span>
              <strong>
                {nodeKinds[hoverNode.kind]} ·{" "}
                {preview(lm, hoverNode, scope, canonicalUnits).action}
              </strong>
              <span>{graphCaption(lm,hoverNode).title}</span>
            </span>
          </div>
        )}
        <div className="lens-zoom">
          <details className="lens-navigation-menu"><summary>Перейти</summary><div className="lens-direction-controls" role="group" aria-label="Перехід між записами">
            {directions.map(direction => <button key={direction.id} title={direction.label} aria-label={direction.label}
              disabled={!keyboardDestination(lm, centerId, scope, direction.id)} onClick={() => navigate(centerId, direction.id)}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d={direction.path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>)}
          </div><p>Клавіші ← →: батько / дочірній запис. ↑ ↓: сусідні записи. Enter: читати.</p></details>
          <button
            aria-label="Зменшити лінзу"
            disabled={zoom <= 0.65}
            onClick={() => setZoom((z) => Math.max(0.65, z - 0.15))}
          >
            −
          </button>
          <button
            onClick={recenter}
          >
            Вписати
          </button>
          <button
            aria-label="Збільшити лінзу"
            disabled={zoom >= 1.65}
            onClick={() => setZoom((z) => Math.min(1.65, z + 0.15))}
          >
            +
          </button>
        </div>
      </div>
      {coverage && <div className="lens-coverage" data-coverage-owner={coverage.owner.id}
        data-coverage-result-ids={coverage.eligible.join(" ")} data-coverage-visible-ids={coverage.displayed.join(" ")}
        data-coverage-hidden-ids={coverage.hidden.join(" ")}>
        <div className="lens-coverage-summary">
          <button aria-expanded={coverageOpen} aria-controls={`${volumeId}-coverage`} onClick={() => setCoverageOpen(open => !open)}>
            {coverageOpen ? "Закрити перелік" : `Усі результати · ${coverage.eligible.length}`}
          </button>
        </div>
        {coverageOpen && <div id={`${volumeId}-coverage`} className="lens-coverage-content">
          <p>{coverage.owner.title}</p>
          <ul>{coverage.eligible.map(id => {
            const node = lm.nodes.get(id)!;
            const shown = coverage.displayed.includes(id);
            const content = preview(lm, node, scope, canonicalUnits);
            return <li key={id} data-coverage-record={id} data-coverage-labelled={shown}>
              <button onClick={() => onRead(id)} aria-label={`Читати: ${node.title}`}>
                <span>{node.title}</span>
                <span>{[content.content, content.time].filter(Boolean).join(" · ")}</span>
              </button>
            </li>;
          })}</ul>
          {!coverage.eligible.length && <p>У цьому відборі немає результатів матеріалу або дослідження.</p>}
        </div>}
      </div>}
      <p className="sr-only" id={`${volumeId}-keyboard`}>Клавіші ← →: батько або дочірній запис. ↑ ↓: сусідні записи. Enter: читати.</p>
    </section>
  );
}
