import type { Connection } from "@xyflow/react";
import type { PlantEdge, PlantNode, Stream } from "./types";

export const portStream = (handleId?: string | null): Stream =>
  handleId?.startsWith("hot") ? "hot" : "cold";

/** Loose handles allow dragging either way; process direction is always outlet → inlet. */
export function normalizeConnection(connection: Connection | PlantEdge): Connection | null {
  const outlet = (id?: string | null) => id === "hot-out" || id === "cold-out";
  const inlet = (id?: string | null) => id === "hot-in" || id === "cold-in";
  if (connection.source === connection.target) return null;
  if (outlet(connection.sourceHandle) && inlet(connection.targetHandle)) {
    return { source: connection.source, sourceHandle: connection.sourceHandle ?? null,
      target: connection.target, targetHandle: connection.targetHandle ?? null };
  }
  if (inlet(connection.sourceHandle) && outlet(connection.targetHandle)) {
    return { source: connection.target, sourceHandle: connection.targetHandle ?? null,
      target: connection.source, targetHandle: connection.sourceHandle ?? null };
  }
  return null;
}

export function isValidPlantConnection(connection: Connection | PlantEdge, edges: PlantEdge[] = [], nodes?: PlantNode[]) {
  const next = normalizeConnection(connection);
  if (!next) return false;
  if (nodes) {
    const source = nodes.find(node => node.id === next.source);
    const target = nodes.find(node => node.id === next.target);
    if (!source || !target) return false;
    // Heaters have one stream, using hot-in/hot-out for their two ports.
    if (source.type === "heater" && next.sourceHandle !== "hot-out") return false;
    if (target.type === "heater" && next.targetHandle !== "hot-in") return false;
  }
  const existing = edges.map(normalizeConnection).filter(item => item !== null);
  // A series pipe cannot split or mix streams without dedicated equipment.
  if (existing.some(edge =>
    (edge.source === next.source && edge.sourceHandle === next.sourceHandle)
    || (edge.target === next.target && edge.targetHandle === next.targetHandle))) return false;
  return true;
}

export function toPlantEdge(connection: Connection): PlantEdge {
  const directed = normalizeConnection(connection);
  if (!directed) throw new RangeError("Connect an outlet to an inlet on another unit.");
  return {
    ...directed,
    id: `${directed.source}.${directed.sourceHandle}--${directed.target}.${directed.targetHandle}`,
    type: "pipe",
    data: { stream: portStream(directed.sourceHandle) },
  };
}
