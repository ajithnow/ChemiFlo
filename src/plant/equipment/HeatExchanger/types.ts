import type { Node } from "@xyflow/react";

export type FlowArrangement = "counter" | "parallel";
export type TubePasses = 1 | 2;

/** Single-phase properties at the stream mean/caloric temperatures. SI units. */
export type HeatExchangerThermalProperties = {
  /** kJ/(kg K) */
  hotSpecificHeat: number;
  coldSpecificHeat: number;
  /** m */
  tubeOuterDiameter: number;
  tubeInnerDiameter: number;
  /** W/(m K) */
  wallConductivity: number;
  /** W/(m² K), evaluated for the actual flows, passes and baffle geometry. */
  shellFilmCoefficient: number;
  tubeFilmCoefficient: number;
  /** m² K/W, each on its own side's surface area. */
  shellFoulingResistance: number;
  tubeFoulingResistance: number;
};

export type HeatExchangerDesign = {
  tubes: number;
  /** m */
  tubeLength: number;
  tubePasses: TubePasses;
  /** Only applies to a single tube pass. */
  arrangement: FlowArrangement;
  baffles: number;
  /** % of shell diameter left open at each baffle */
  baffleCut: number;
  /** Missing fields use the documented water/demo defaults. */
  thermal?: Partial<HeatExchangerThermalProperties>;
};

export type HeatExchangerData = HeatExchangerDesign & {
  label: string;
  running: boolean;
  collapsed: boolean;
  /** °C */
  hotIn: number;
  coldIn: number;
  /** kg/s */
  hotFlow: number;
  coldFlow: number;
};

export type HeatExchangerNodeType = Node<HeatExchangerData, "heatExchanger">;
