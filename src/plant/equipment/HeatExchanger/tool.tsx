import type { PlantTool } from "../../catalog";
import { HeatExchangerSymbol } from "./HeatExchanger";
import { defaultHeatExchangerData } from "./model";

export const heatExchangerTool: PlantTool = {
  type: "heatExchanger",
  name: "Heat exchanger",
  group: "heat-transfer",
  prefix: "E-",
  icon: <HeatExchangerSymbol running={false} />,
  create: (tag, position) => ({ id: tag, type: "heatExchanger", position, data: defaultHeatExchangerData(tag) }),
};
