import { isValidPlantConnection, normalizeConnection, portStream } from "./connections.js";
import { heatExchangerPerformance, thermalProperties } from "./equipment/HeatExchanger/model.js";
import { solveTemperatures } from "./linear-system.js";
import { heaterPerformance } from "./equipment/Heater/model.js";
import type { HeaterData, HeatExchangerData, PipeData, PlantEdge, PlantNode, Stream } from "./types";

/** Steady plug flow, constant Cp and ambient: T2 = Ta + (T1-Ta) exp(-UA/mCp). */
export function pipePerformance(temperature: number, flow: number, specificHeat: number, pipe?: Partial<PipeData>) {
  const ua = pipe?.thermalConductance ?? 0;
  const ambient = pipe?.ambientTemperature ?? 25;
  if (![temperature, flow, specificHeat, ua, ambient].every(Number.isFinite)
    || flow < 0 || specificHeat <= 0 || ua < 0) throw new RangeError("Invalid pipe thermal inputs.");
  // No throughflow means no transported heat; retain the inlet as a display convention.
  const fraction = flow === 0 ? 0 : -Math.expm1(-ua / (1000 * flow * specificHeat));
  const outlet = temperature + (ambient - temperature) * fraction;
  return { outlet, heatLoss: flow * specificHeat * (temperature - outlet) };
}

export type ConnectedInlet = {
  edge: PlantEdge;
  sourceLabel: string;
  sourceStream: Stream;
  outlet: number;
  heatLoss: number;
  /** In a closed circulation loop, one unit supplies mass flow and Cp. */
  controlsFlow: boolean;
  loop: boolean;
  flowSourceLabel: string;
  calculationError?: string;
};
type StreamState = { temperature: number; flow: number; specificHeat: number };
type ResolvedStreams = {
  calculationError?: string;
  inlets: Partial<Record<Stream, ConnectedInlet>>;
  outlets: Partial<Record<Stream, StreamState>>;
};
export type ResolvedEquipment = ResolvedStreams & ({
  type: "heatExchanger";
  data: HeatExchangerData;
  performance: ReturnType<typeof heatExchangerPerformance>;
} | {
  type: "heater";
  data: HeaterData;
  performance: ReturnType<typeof heaterPerformance>;
});

type Slot = {
  node: PlantNode;
  stream: Stream;
  saved: StreamState;
  edge?: PlantEdge;
  upstream?: number;
};

/** Solve constant-property energy balances together, including circulation loops. */
export function resolvePlant(nodes: PlantNode[], edges: PlantEdge[]) {
  const accepted: PlantEdge[] = [];
  for (const edge of edges) {
    if (!isValidPlantConnection(edge, accepted, nodes)) {
      throw new RangeError("Pipes require an outlet and an inlet on different units, with one pipe per port.");
    }
    accepted.push({ ...edge, ...normalizeConnection(edge)! });
  }
  const slots: Slot[] = [];
  const indices = new Map<string, Partial<Record<Stream, number>>>();
  // Stable ordering makes reference selection independent of placement/edge order.
  const ordered = [...nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const node of ordered) {
    const entry: Partial<Record<Stream, number>> = {};
    if (node.type === "heater") {
      entry.hot = slots.length;
      slots.push({ node, stream: "hot", saved: { temperature: node.data.inletTemperature,
        flow: node.data.massFlow, specificHeat: node.data.specificHeat } });
    } else {
      const cp = thermalProperties(node.data);
      for (const stream of ["hot", "cold"] as const) {
        entry[stream] = slots.length;
        slots.push({ node, stream, saved: { temperature: node.data[`${stream}In`],
          flow: node.data[`${stream}Flow`], specificHeat: cp[`${stream}SpecificHeat`] } });
      }
    }
    indices.set(node.id, entry);
  }
  for (const edge of accepted) {
    const target = indices.get(edge.target)![portStream(edge.targetHandle)]!;
    slots[target].edge = edge;
    slots[target].upstream = indices.get(edge.source)![portStream(edge.sourceHandle)]!;
  }

  // Fluid properties follow each material stream independently of heat exchange.
  // Open paths use their feed. Rings prefer a heater, then the lowest node ID.
  const owners = new Map<number, number>();
  const loopOwners = new Set<number>();
  for (let start = 0; start < slots.length; start++) {
    if (owners.has(start)) continue;
    const path: number[] = [];
    let current = start;
    while (!owners.has(current) && !path.includes(current)) {
      path.push(current);
      const upstream = slots[current].upstream;
      if (upstream === undefined) {
        owners.set(current, current);
        break;
      }
      current = upstream;
    }
    if (!owners.has(current)) {
      const cycle = path.slice(path.indexOf(current));
      const candidates = cycle.filter(index => slots[index].node.type === "heater");
      const owner = Math.min(...(candidates.length ? candidates : cycle));
      owners.set(current, owner);
      loopOwners.add(owner);
    }
    const owner = owners.get(current)!;
    for (const index of path) owners.set(index, owner);
  }
  const fluid = slots.map((_, index) => slots[owners.get(index)!].saved);
  const references = slots.map((slot, index) => loopOwners.has(owners.get(index)!) ? fluid[index].temperature : slot.saved.temperature);

  function equipmentData(node: PlantNode, temperatures: number[]) {
    const entry = indices.get(node.id)!;
    const hot = entry.hot!;
    if (node.type === "heater") {
      const data = { ...node.data, inletTemperature: temperatures[hot], massFlow: fluid[hot].flow, specificHeat: fluid[hot].specificHeat };
      const performance = heaterPerformance(data);
      return { type: "heater" as const, data, performance, outlets: {
        hot: { temperature: performance.outletTemperature, flow: data.massFlow, specificHeat: data.specificHeat },
      } };
    }
    const cold = entry.cold!;
    const data = { ...node.data, hotIn: temperatures[hot], coldIn: temperatures[cold],
      hotFlow: fluid[hot].flow, coldFlow: fluid[cold].flow,
      thermal: { ...node.data.thermal, hotSpecificHeat: fluid[hot].specificHeat, coldSpecificHeat: fluid[cold].specificHeat } };
    const performance = heatExchangerPerformance(data);
    return { type: "heatExchanger" as const, data, performance, outlets: {
      hot: { ...fluid[hot], temperature: performance.hotOut },
      cold: { ...fluid[cold], temperature: performance.coldOut },
    } };
  }

  // Each equipment outlet is an affine function of its inlet temperature(s).
  const outletTerms = slots.map(() => new Map<number, number>());
  const outletConstants = slots.map(() => 0);
  for (const node of ordered) {
    const entry = indices.get(node.id)!;
    const hot = entry.hot!;
    const basis = Array(slots.length).fill(0) as number[];
    basis[hot] = 1;
    const rated = equipmentData(node, basis);
    if (rated.type === "heater") {
      outletTerms[hot].set(hot, 1);
      outletConstants[hot] = rated.performance.temperatureRise;
    } else {
      const cold = entry.cold!;
      const hotFraction = 1 - rated.performance.hotOut;
      const coldFraction = rated.performance.coldOut;
      outletTerms[hot].set(hot, 1 - hotFraction);
      outletTerms[hot].set(cold, hotFraction);
      outletTerms[cold].set(hot, coldFraction);
      outletTerms[cold].set(cold, 1 - coldFraction);
    }
  }
  const matrix = slots.map(() => Array(slots.length).fill(0) as number[]);
  const constants = slots.map(() => 0);
  for (const [index, slot] of slots.entries()) {
    matrix[index][index] = 1;
    if (slot.upstream === undefined) {
      constants[index] = slot.saved.temperature;
      continue;
    }
    const { flow, specificHeat } = fluid[index];
    const offset = pipePerformance(0, flow, specificHeat, slot.edge?.data).outlet;
    const retention = pipePerformance(1, flow, specificHeat, { ...slot.edge?.data, ambientTemperature: 0 }).outlet;
    for (const [source, coefficient] of outletTerms[slot.upstream]) matrix[index][source] -= retention * coefficient;
    constants[index] = offset + retention * outletConstants[slot.upstream];
  }
  const temperatures = solveTemperatures(matrix, constants, references);
  const calculationError = temperatures ? undefined : "No steady-state temperature: the loop's heat input cannot be balanced. Run the exchanger with flow on its other side, add pipe heat loss, or turn off the heater.";
  const resolved = new Map<string, ResolvedEquipment>();
  for (const node of ordered) {
    resolved.set(node.id, { ...equipmentData(node, temperatures ?? references), inlets: {}, calculationError });
  }
  for (const [index, slot] of slots.entries()) {
    if (slot.upstream === undefined || !slot.edge) continue;
    const upstream = slots[slot.upstream];
    const source = resolved.get(upstream.node.id)!;
    const outlet = source.outlets[upstream.stream]!;
    const pipe = pipePerformance(outlet.temperature, outlet.flow, outlet.specificHeat, slot.edge.data);
    const owner = owners.get(index)!;
    resolved.get(slot.node.id)!.inlets[slot.stream] = {
      edge: slot.edge, sourceLabel: source.data.label, sourceStream: upstream.stream, ...pipe,
      controlsFlow: owner === index, loop: loopOwners.has(owner), flowSourceLabel: slots[owner].node.data.label, calculationError,
    };
  }
  return resolved;
}
