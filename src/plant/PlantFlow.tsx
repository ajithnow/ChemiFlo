import { ConnectionMode, ReactFlow, type ReactFlowInstance, type ReactFlowProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { findTool, PLANT_DROP_EVENT, nextTag, type PlantDropDetail } from "./catalog";
import type { PlantMode } from "./components/Toolbox";
import { PlantPropertiesPanel } from "./components/PropertiesPanel";
import { isValidPlantConnection } from "./connections";
import { PlantSimulation } from "./PlantSimulation";
import { plantEdgeTypes, plantNodeTypes } from "./registry";
import type { PlantEdge, PlantNode } from "./types";

export type PlantFlowProps = Omit<ReactFlowProps<PlantNode, PlantEdge>, "nodeTypes" | "edgeTypes" | "nodes" | "edges"> & {
  nodes: PlantNode[];
  edges: PlantEdge[];
  mode?: PlantMode;
};

/** Equipment is placed by its top-left corner; offset so the drop point lands near the symbol. */
const DROP_OFFSET = { x: 120, y: 55 };

export const PlantFlow = ({ nodes, edges, mode = "select", className, children, onInit, ...props }: PlantFlowProps) => {
  const [flow, setFlow] = useState<ReactFlowInstance<PlantNode, PlantEdge> | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element || !flow) return;

    const onPlace = (event: Event) => {
      const { type, clientX, clientY } = (event as CustomEvent<PlantDropDetail>).detail;
      const tool = findTool(type);
      if (!tool) return;
      const bounds = element.getBoundingClientRect();
      const point = flow.screenToFlowPosition({
        x: clientX ?? bounds.left + bounds.width / 2,
        y: clientY ?? bounds.top + bounds.height / 2,
      });
      const tag = nextTag(tool.prefix, flow.getNodes().map(node => node.id));
      const placed = tool.create(tag, { x: point.x - DROP_OFFSET.x, y: point.y - DROP_OFFSET.y });
      flow.setNodes(current => [
        ...current.map(node => node.selected ? { ...node, selected: false } : node),
        { ...placed, selected: true },
      ]);
    };

    element.addEventListener(PLANT_DROP_EVENT, onPlace);
    return () => element.removeEventListener(PLANT_DROP_EVENT, onPlace);
  }, [flow]);

  const panning = mode === "pan";

  return (
    <PlantSimulation nodes={nodes} edges={edges}>
      <ReactFlow
        ref={wrapper}
        nodes={nodes}
        edges={edges}
        nodeTypes={plantNodeTypes}
        edgeTypes={plantEdgeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={connection => isValidPlantConnection(connection, edges, nodes)}
        panOnDrag={panning ? true : [1, 2]}
        selectionOnDrag={!panning}
        nodesDraggable={!panning}
        nodesConnectable={!panning}
        onInit={(instance) => {
          setFlow(instance);
          onInit?.(instance);
        }}
        className={`plant plant-mode-${mode}${className ? ` ${className}` : ""}`}
        {...props}
      >
        {children}
        <PlantPropertiesPanel />
      </ReactFlow>
    </PlantSimulation>
  );
};
