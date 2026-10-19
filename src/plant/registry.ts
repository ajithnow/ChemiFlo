import { PipeEdge } from "./edges/PipeEdge";
import { HeatExchangerNode } from "./equipment/HeatExchanger";

export const plantNodeTypes = {
  heatExchanger: HeatExchangerNode,
};

export const plantEdgeTypes = {
  pipe: PipeEdge,
};
