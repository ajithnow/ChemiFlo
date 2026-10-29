import { PipeEdge } from "./edges/PipeEdge";
import { HeatExchangerNode } from "./equipment/HeatExchanger";

import { HeaterNode } from "./equipment/Heater";

export const plantNodeTypes = {
  heatExchanger: HeatExchangerNode,
  heater: HeaterNode,
};

export const plantEdgeTypes = {
  pipe: PipeEdge,
};
