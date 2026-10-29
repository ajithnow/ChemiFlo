import type { Edge } from "@xyflow/react";
import type { HeaterNodeType } from "./equipment/Heater/types";
import type { HeatExchangerNodeType } from "./equipment/HeatExchanger/types";

export type { HeatExchangerData, HeatExchangerNodeType } from "./equipment/HeatExchanger/types";

export type { HeaterData, HeaterNodeType } from "./equipment/Heater/types";

export type Stream = "hot" | "cold";

export type PlantNode = HeatExchangerNodeType | HeaterNodeType;

export type PipeData = {
  stream: Stream;
  /** Total pipe-to-ambient conductance UA, W/K. Zero means insulated. */
  thermalConductance?: number;
  /** °C */
  ambientTemperature?: number;
};
export type PipeEdgeType = Edge<PipeData, "pipe">;
export type PlantEdge = PipeEdgeType;
