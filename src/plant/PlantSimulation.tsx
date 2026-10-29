import { useMemo, type ReactNode } from "react";
import { resolvePlant, type ResolvedEquipment } from "./network";
import type { PlantEdge, PlantNode } from "./types";

import { SimulationContext } from "./simulationContext";

export function PlantSimulation({ nodes, edges, children }: { nodes: PlantNode[]; edges: PlantEdge[]; children: ReactNode }) {
  const result = useMemo(() => {
    try {
      const equipment = resolvePlant(nodes, edges);
      const error = [...equipment.values()].find(item => item.calculationError)?.calculationError ?? null;
      return { equipment, error };
    } catch (error) {
      return { equipment: new Map<string, ResolvedEquipment>(), error: String(error) };
    }
  }, [nodes, edges]);
  return (
    <SimulationContext.Provider value={result.equipment}>
      {children}
      {result.error && <div className="plant-network-error" role="alert">Network calculation unavailable: {result.error}</div>}
    </SimulationContext.Provider>
  );
}

