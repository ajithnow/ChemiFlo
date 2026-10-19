import { Handle, Position } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";
import { portStream } from "../connections";

export interface PortProps {
  id: string;
  position: Position;
  offset?: number;
}

/** A nozzle. Placed inside Equipment's `symbol`, so it lines up with the drawing, not the card. */
export const Port = ({ id, position, offset }: PortProps) => {
  const alongY = position === Position.Left || position === Position.Right;
  const style: CSSProperties | undefined =
    offset === undefined ? undefined : alongY ? { top: `${offset}%` } : { left: `${offset}%` };

  return (
    <Handle
      id={id}
      type="source"
      position={position}
      className={`plant-port plant-port-${portStream(id)}`}
      style={style}
    />
  );
};

export interface EquipmentProps {
  tag: string;
  running: boolean;
  onToggleRunning: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** When supplied, show a compact summary and open a separate properties panel. */
  onOpenProperties?: () => void;
  propertiesOpen?: boolean;
  symbol: ReactNode;
  /** Shown instead of the details while collapsed. */
  summary?: ReactNode;
  children?: ReactNode;
}

export const Equipment = ({ tag, running, onToggleRunning, collapsed = false, onToggleCollapsed, onOpenProperties, propertiesOpen, symbol, summary, children }: EquipmentProps) => (
  <div className={`plant-equipment${running ? " is-running" : ""}`}>
    <div className="plant-equipment-symbol">{symbol}</div>
    <div className="plant-faceplate">
      <div className="plant-faceplate-header">
        <button
          type="button"
          className="plant-collapse nodrag"
          aria-expanded={onOpenProperties ? propertiesOpen : !collapsed}
          aria-label={onOpenProperties ? `Edit ${tag} properties` : collapsed ? `Show ${tag} details` : `Hide ${tag} details`}
          title={onOpenProperties ? "Open properties" : undefined}
          onClick={onOpenProperties ?? onToggleCollapsed}
        >
          <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden>
            <path d="M9 6 L15 12 L9 18" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="plant-faceplate-tag">{tag}</span>
        <span className="plant-status">
          <span className="plant-status-dot" aria-hidden />
          {running ? "Running" : "Stopped"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={running}
          aria-label={`Run ${tag}`}
          className="plant-switch nodrag"
          onClick={onToggleRunning}
        >
          <span className="plant-switch-thumb" aria-hidden />
        </button>
      </div>
      {collapsed || onOpenProperties
        ? summary && <div className="plant-faceplate-summary">{summary}</div>
        : children && <div className="plant-faceplate-controls nodrag nowheel">{children}</div>}
    </div>
  </div>
);
