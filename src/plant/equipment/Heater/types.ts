import type { Node } from "@xyflow/react";

export type HeaterData = {
  label: string;
  running: boolean;
  /** °C */
  inletTemperature: number;
  /** kg/s */
  massFlow: number;
  /** kJ/(kg K), constant single-phase fluid heat capacity. */
  specificHeat: number;
  /** kW delivered to the fluid when running with positive flow. */
  power: number;
};

export type HeaterNodeType = Node<HeaterData, "heater">;
