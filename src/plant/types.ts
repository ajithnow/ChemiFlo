import type { Edge } from "@xyflow/react";
import type { HeatExchangerNodeType } from "./equipment/HeatExchanger/types";

export type { HeatExchangerData, HeatExchangerNodeType } from "./equipment/HeatExchanger/types";

export type Stream = "hot" | "cold";

export type PlantNode = HeatExchangerNodeType;

export type PipeEdgeType = Edge<{ stream: Stream }, "pipe">;
export type PlantEdge = PipeEdgeType;
