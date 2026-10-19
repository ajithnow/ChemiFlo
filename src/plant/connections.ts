import type { Connection } from "@xyflow/react";
import type { PlantEdge, Stream } from "./types";

export const portStream = (handleId?: string | null): Stream =>
  handleId?.startsWith("hot") ? "hot" : "cold";

export const isValidPlantConnection = (connection: Connection | PlantEdge) =>
  connection.source !== connection.target;

export const toPlantEdge = (connection: Connection): PlantEdge => ({
  ...connection,
  id: `${connection.source}.${connection.sourceHandle}--${connection.target}.${connection.targetHandle}`,
  type: "pipe",
  data: { stream: portStream(connection.sourceHandle) },
});
