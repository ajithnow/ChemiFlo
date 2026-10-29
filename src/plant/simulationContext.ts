import { createContext, useContext } from "react";
import type { ResolvedEquipment } from "./network";

export const SimulationContext = createContext(new Map<string, ResolvedEquipment>());
export const useResolvedEquipment = (id: string) => useContext(SimulationContext).get(id);
