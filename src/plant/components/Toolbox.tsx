import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PLANT_DROP_EVENT, plantToolGroups, plantTools, type PlantDropDetail, type PlantTool, type PlantToolGroup } from "../catalog";

export type PlantMode = "select" | "pan";

export interface PlantToolboxProps {
  mode: PlantMode;
  onModeChange: (mode: PlantMode) => void;
  defaultExpanded?: boolean;
  /** e.g. "dark" to match a dark canvas */
  className?: string;
}

const SHORTCUTS: Record<string, PlantMode> = { v: "select", h: "pan" };
const DRAG_THRESHOLD = 4;

interface DragState {
  tool: PlantTool;
  startX: number;
  startY: number;
  moved: boolean;
}

function placeTool(type: string, point?: { clientX: number; clientY: number }) {
  const canvas = point
    ? document.elementFromPoint(point.clientX, point.clientY)?.closest(".plant")
    : document.querySelector(".plant");
  canvas?.dispatchEvent(new CustomEvent<PlantDropDetail>(PLANT_DROP_EVENT, { detail: { type, ...point } }));
}

const SelectIcon = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
    <path d="M6 3 L6 19 L10 15 L13 21 L15.5 20 L12.5 14 L18 14 Z" fill="currentColor" />
  </svg>
);

const PanIcon = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 V21 M3 12 H21 M12 3 L9 6 M12 3 L15 6 M12 21 L9 18 M12 21 L15 18 M3 12 L6 9 M3 12 L6 15 M21 12 L18 9 M21 12 L18 15" />
  </svg>
);

const Chevron = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6 L15 12 L9 18" />
  </svg>
);

const ModeButton = ({ name, active, onClick, children }: { name: string; active: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    className={`plant-tool plant-mode-tool${active ? " is-active" : ""}`}
    aria-label={name}
    aria-pressed={active}
    data-tooltip={name}
    onClick={onClick}
  >
    {children}
  </button>
);

export const PlantToolbox = ({ mode, onModeChange, defaultExpanded = true, className }: PlantToolboxProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<PlantToolGroup>>(new Set());
  const [draggingTool, setDraggingTool] = useState<PlantTool | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<DragState | null>(null);
  // A drag that ends back on its own tile must not also count as a click.
  const suppressClick = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.metaKey || event.altKey || target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const next = SHORTCUTS[event.key.toLowerCase()];
      if (next) onModeChange(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onModeChange]);

  // Track an active drag on the window so it keeps working over the canvas.
  useEffect(() => {
    if (!draggingTool) return;

    const end = () => {
      drag.current = null;
      setDraggingTool(null);
      setGhost(null);
    };

    const onMove = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      current.moved ||= Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > DRAG_THRESHOLD;
      if (current.moved) setGhost({ x: event.clientX, y: event.clientY });
    };

    const onUp = (event: PointerEvent) => {
      const current = drag.current;
      end();
      if (current?.moved && event.type === "pointerup") {
        suppressClick.current = true;
        placeTool(current.tool.type, { clientX: event.clientX, clientY: event.clientY });
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") end();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [draggingTool]);

  const startDrag = (event: ReactPointerEvent, tool: PlantTool) => {
    if (event.button !== 0) return;
    event.preventDefault();
    suppressClick.current = false;
    drag.current = { tool, startX: event.clientX, startY: event.clientY, moved: false };
    setDraggingTool(tool);
  };

  const onToolClick = (tool: PlantTool) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    placeTool(tool.type);
  };

  const toggleSection = (id: PlantToolGroup) =>
    setCollapsedSections(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className={`plant-toolbox${expanded ? " is-expanded" : ""}${className ? ` ${className}` : ""}`} aria-label="Tools">
      <div className="plant-toolbox-header">
        {expanded && <span className="plant-toolbox-title">Tools</span>}
        <button
          type="button"
          className="plant-tool plant-toolbox-toggle"
          aria-label={expanded ? "Collapse tools" : "Expand tools"}
          aria-expanded={expanded}
          data-tooltip={expanded ? undefined : "Expand"}
          onClick={() => setExpanded(!expanded)}
        >
          <Chevron className={expanded ? "is-flipped" : undefined} />
        </button>
      </div>

      <div className="plant-toolbox-modes">
        <ModeButton name="Select (V)" active={mode === "select"} onClick={() => onModeChange("select")}>
          <SelectIcon />
        </ModeButton>
        <ModeButton name="Pan (H)" active={mode === "pan"} onClick={() => onModeChange("pan")}>
          <PanIcon />
        </ModeButton>
      </div>

      {plantToolGroups.map(group => {
        const open = !expanded || !collapsedSections.has(group.id);
        const gridId = `plant-toolbox-${group.id}`;
        return (
          <section key={group.id} className="plant-toolbox-section" aria-label={group.title}>
            {expanded ? (
              <button
                type="button"
                className="plant-toolbox-section-header"
                aria-expanded={open}
                aria-controls={gridId}
                onClick={() => toggleSection(group.id)}
              >
                <Chevron className={open ? "is-down" : undefined} />
                {group.title}
              </button>
            ) : (
              <hr className="plant-toolbox-divider" />
            )}
            {open && (
              <div id={gridId} className="plant-toolbox-grid">
                {plantTools.filter(tool => tool.group === group.id).map(tool => (
                  <button
                    key={tool.type}
                    type="button"
                    className="plant-tool plant-component-tool"
                    aria-label={`Add ${tool.name}`}
                    data-tooltip={expanded ? undefined : tool.name}
                    onPointerDown={event => startDrag(event, tool)}
                    onClick={() => onToolClick(tool)}
                  >
                    {tool.icon}
                    {expanded && <span className="plant-tool-name">{tool.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {draggingTool && ghost &&
        createPortal(
          <div className={`plant-toolbox-ghost${className ? ` ${className}` : ""}`} style={{ left: ghost.x, top: ghost.y }} aria-hidden>
            {draggingTool.icon}
          </div>,
          document.body,
        )}
    </aside>
  );
};
