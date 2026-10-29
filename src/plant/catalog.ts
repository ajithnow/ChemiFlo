import type { XYPosition } from "@xyflow/react";
import type { ReactNode } from "react";
import { heatExchangerTool } from "./equipment/HeatExchanger";
import { heaterTool } from "./equipment/Heater";
import type { PlantNode } from "./types";

export const PLANT_DROP_EVENT = "plant:drop";

export interface PlantDropDetail {
  type: string;
  clientX?: number;
  clientY?: number;
}

export type PlantNodeKind = NonNullable<PlantNode["type"]>;

export type PlantToolGroup = "heat-transfer";

export const plantToolGroups: { id: PlantToolGroup; title: string }[] = [
  { id: "heat-transfer", title: "Heat transfer" },
];

export interface PlantTool {
  type: PlantNodeKind;
  name: string;
  group: PlantToolGroup;
  prefix: string;
  icon: ReactNode;
  create: (tag: string, position: XYPosition) => PlantNode;
}

export const plantTools: PlantTool[] = [heatExchangerTool, heaterTool];

export const findTool = (type: string) => plantTools.find(tool => tool.type === type);

export const nextTag = (prefix: string, takenIds: Iterable<string>) => {
  const taken = new Set(takenIds);
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};
