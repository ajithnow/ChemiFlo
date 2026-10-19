import { Panel, useNodes, useReactFlow } from "@xyflow/react";
import { useId } from "react";
import { HeatExchangerProperties } from "../equipment/HeatExchanger/HeatExchanger";
import type { PlantEdge, PlantNode } from "../types";

/** A single inspector anchored to the viewport, independent of canvas zoom. */
export const PlantPropertiesPanel = () => {
  const nodes = useNodes<PlantNode>();
  const { setNodes, updateNodeData } = useReactFlow<PlantNode, PlantEdge>();
  const titleId = useId();
  const selection = nodes.filter(node => node.selected);
  if (selection.length !== 1) return null;
  const node = selection[0];
  const close = () => setNodes(current => current.map(item => item.selected ? { ...item, selected: false } : item));

  return (
    <Panel position="top-right" className="plant-properties-panel nodrag nopan nowheel">
      <aside
        className={`plant-properties${node.data.running ? " is-running" : ""}`}
        aria-labelledby={titleId}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Escape") close();
        }}
      >
        <header className="plant-properties-header">
          <div>
            <span className="plant-properties-eyebrow">Heat exchanger</span>
            <h2 id={titleId}>{node.data.label} properties</h2>
          </div>
          <button type="button" className="plant-properties-close" aria-label="Close properties" onClick={close}>
            <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
              <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="plant-properties-status">
          <span className="plant-status"><span className="plant-status-dot" aria-hidden />{node.data.running ? "Running" : "Stopped"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={node.data.running}
            aria-label={`Run ${node.data.label} from properties`}
            className="plant-switch"
            onClick={() => updateNodeData(node.id, { running: !node.data.running })}
          >
            <span className="plant-switch-thumb" aria-hidden />
          </button>
        </div>
        <div className="plant-properties-body" key={node.id}>
          <HeatExchangerProperties id={node.id} data={node.data} />
        </div>
      </aside>
    </Panel>
  );
};
