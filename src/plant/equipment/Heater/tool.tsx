import type { PlantTool } from "../../catalog";
import { HeaterSymbol } from "./Heater";
import { defaultHeaterData } from "./model";

export const heaterTool: PlantTool = {
  type: "heater",
  name: "Heater",
  group: "heat-transfer",
  prefix: "H-",
  icon: <HeaterSymbol heating={false} />,
  create: (tag, position) => ({ id: tag, type: "heater", position, data: defaultHeaterData(tag) }),
};
