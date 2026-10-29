import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultHeaterData } from "../.test-build/equipment/Heater/model.js";
import { defaultHeatExchangerData, heatExchangerPerformance } from "../.test-build/equipment/HeatExchanger/model.js";
import { isValidPlantConnection, toPlantEdge } from "../.test-build/connections.js";
import { resolvePlant } from "../.test-build/network.js";

const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const heater = (id = "H", patch = {}) => ({ id, type: "heater", position: { x: 0, y: 0 }, data: { ...defaultHeaterData(id), running: true, ...patch } });
const exchanger = (id = "E", patch = {}) => ({ id, type: "heatExchanger", position: { x: 0, y: 0 }, data: { ...defaultHeatExchangerData(id), running: true, ...patch } });
const pipe = (source, target, sourceHandle = "hot-out", targetHandle = "hot-in") => toPlantEdge({ source, target, sourceHandle, targetHandle });
const supply = pipe("H", "E");
const returning = pipe("E", "H");
const loop = [supply, returning];

function verifyContinuity(result) {
  for (const equipment of result.values()) {
    assert.equal(equipment.calculationError, undefined);
    for (const [stream, inlet] of Object.entries(equipment.inlets)) {
      const temperature = equipment.type === "heater" ? equipment.data.inletTemperature : equipment.data[`${stream}In`];
      close(temperature, inlet.outlet);
    }
  }
}

test("both heater ports connect to an exchanger heating stream in either order or drag direction", () => {
  const nodes = [heater(), exchanger()];
  for (const edges of [loop, [...loop].reverse()]) {
    assert.equal(isValidPlantConnection(edges[0], [], nodes), true);
    assert.equal(isValidPlantConnection(edges[1], [edges[0]], nodes), true);
    const reverse = { source: edges[1].target, target: edges[1].source, sourceHandle: edges[1].targetHandle, targetHandle: edges[1].sourceHandle };
    assert.equal(isValidPlantConnection(reverse, [edges[0]], nodes), true);
    verifyContinuity(resolvePlant(nodes, [edges[0], toPlantEdge(reverse)]));
  }
});

test("heater/exchanger circulation matches an independent closed-loop energy balance", () => {
  const h = heater("H", { massFlow: 2, specificHeat: 3, power: 120 });
  const e = exchanger();
  const before = structuredClone([h, e, ...loop]);
  const result = resolvePlant([e, h], loop);
  verifyContinuity(result);
  const rated = heatExchangerPerformance({ ...e.data, hotFlow: 2, thermal: { hotSpecificHeat: 3 }, hotIn: 1, coldIn: 0 });
  const expectedSupply = e.data.coldIn + 120 / rated.duty;
  close(result.get("H").performance.outletTemperature, expectedSupply);
  close(result.get("H").data.inletTemperature, expectedSupply - 20);
  close(result.get("E").performance.duty, 120);
  close(result.get("E").performance.coldOut, 25 + 120 / (5 * 4.18));
  assert.equal(result.get("H").inlets.hot.controlsFlow, true);
  assert.equal(result.get("E").inlets.hot.controlsFlow, false);
  assert.equal(result.get("E").inlets.hot.flowSourceLabel, "H");
  assert.equal(result.get("E").data.hotFlow, 2);
  assert.equal(result.get("E").data.thermal.hotSpecificHeat, 3);
  assert.deepEqual([h, e, ...loop], before);
});

test("loop results are independent of edge/node order and respond to power, flow, Cp and coolant changes", () => {
  const nodes = [heater(), exchanger()];
  const original = resolvePlant(nodes, loop);
  const reordered = resolvePlant([...nodes].reverse(), [...loop].reverse());
  for (const id of ["H", "E"]) assert.deepEqual(original.get(id), reordered.get(id));
  for (const patch of [{ power: 200 }, { massFlow: 2 }, { specificHeat: 2 }]) {
    const result = resolvePlant([heater("H", patch), exchanger()], loop);
    verifyContinuity(result);
    assert.notEqual(result.get("H").performance.outletTemperature, original.get("H").performance.outletTemperature);
    close(result.get("E").performance.duty, patch.power ?? 100);
  }
  const warmer = resolvePlant([heater(), exchanger("E", { coldIn: 40 })], loop);
  close(warmer.get("H").performance.outletTemperature - original.get("H").performance.outletTemperature, 15);
});

test("both pipe losses are included in the loop energy balance", () => {
  const edges = loop.map(edge => ({ ...edge, data: { stream: "hot", thermalConductance: 250, ambientTemperature: 15 } }));
  const result = resolvePlant([heater(), exchanger()], edges);
  verifyContinuity(result);
  close(result.get("H").performance.duty,
    result.get("E").performance.duty + result.get("E").inlets.hot.heatLoss + result.get("H").inlets.hot.heatLoss);
});

test("a loop with two exchangers and two heaters conserves energy and chooses one flow control", () => {
  const nodes = [heater("H1", { power: 80, massFlow: 2 }), heater("H2", { power: 120, massFlow: 8 }), exchanger("E1"), exchanger("E2")];
  const edges = [pipe("H1", "E1"), pipe("E1", "H2"), pipe("H2", "E2"), pipe("E2", "H1")];
  const result = resolvePlant(nodes, edges);
  verifyContinuity(result);
  close(result.get("E1").performance.duty + result.get("E2").performance.duty, 200);
  assert.equal(result.get("H1").inlets.hot.controlsFlow, true);
  assert.equal(result.get("H2").inlets.hot.controlsFlow, false);
  assert.equal(result.get("H2").data.massFlow, 2);
});

test("stopped heater cools to coolant temperature; zero flow and passive loops remain finite", () => {
  const stopped = resolvePlant([heater("H", { running: false }), exchanger()], loop);
  verifyContinuity(stopped);
  close(stopped.get("H").data.inletTemperature, 25);
  close(stopped.get("E").performance.duty, 0);
  const passive = resolvePlant([heater("H", { running: false, inletTemperature: 60 }), exchanger("E", { running: false })], loop);
  verifyContinuity(passive);
  close(passive.get("E").data.hotIn, 60);
  const zero = resolvePlant([heater("H", { massFlow: 0 }), exchanger()], loop);
  verifyContinuity(zero);
  close(zero.get("H").performance.duty, 0);
  close(zero.get("E").data.hotFlow, 0);
});

test("powered loop without a heat sink stays connected and reports unavailable temperatures", () => {
  for (const patch of [{ running: false }, { coldFlow: 0 }]) {
    const result = resolvePlant([heater(), exchanger("E", patch)], loop);
    assert.match(result.get("H").calculationError, /No steady-state temperature/);
    assert.match(result.get("E").inlets.hot.calculationError, /No steady-state temperature/);
    // Keep the flow control and return-pipe settings available to fix the loop.
    assert.equal(result.get("H").inlets.hot.controlsFlow, true);
    assert.equal(result.get("H").inlets.hot.edge.id, returning.id);
  }
  const restored = resolvePlant([heater(), exchanger()], loop);
  verifyContinuity(restored);
  const dissipating = resolvePlant([heater(), exchanger("E", { running: false })], [
    supply, { ...returning, data: { stream: "hot", thermalConductance: 500, ambientTemperature: 25 } },
  ]);
  verifyContinuity(dissipating);
  close(dissipating.get("H").inlets.hot.heatLoss, 100);
});

test("opening the loop restores the new feed's saved inputs and retains remaining propagation", () => {
  const nodes = [heater("H", { inletTemperature: 30, massFlow: 2 }), exchanger("E", { hotIn: 140, hotFlow: 5 })];
  resolvePlant(nodes, loop);
  const openReturn = resolvePlant(nodes, [supply]);
  close(openReturn.get("H").data.inletTemperature, 30);
  close(openReturn.get("E").data.hotFlow, 2);
  assert.deepEqual(openReturn.get("H").inlets, {});
  const openSupply = resolvePlant(nodes, [returning]);
  close(openSupply.get("E").data.hotIn, 140);
  close(openSupply.get("H").data.massFlow, 5);
  assert.equal(openSupply.get("H").inlets.hot.controlsFlow, false);
});

test("thermal cycles between exchangers can have separate open material streams", () => {
  const nodes = [exchanger("A", { hotIn: 150 }), exchanger("B", { coldIn: 10 })];
  const result = resolvePlant(nodes, [pipe("A", "B"), pipe("B", "A", "cold-out", "cold-in")]);
  verifyContinuity(result);
  assert.equal(result.get("A").inlets.cold.loop, false);
  assert.equal(result.get("B").inlets.hot.loop, false);
});

test("exchanger-only circulation uses a stable stream owner and equilibrates with its open feeds", () => {
  const nodes = [exchanger("B"), exchanger("A", { hotFlow: 2, coldIn: 40 }), exchanger("C")];
  const edges = [pipe("A", "B"), pipe("B", "C"), pipe("C", "A")];
  const result = resolvePlant(nodes, edges);
  verifyContinuity(result);
  assert.equal(result.get("A").inlets.hot.controlsFlow, true);
  assert.equal(result.get("B").data.hotFlow, 2);
  close([...result.values()].reduce((sum, unit) => sum + unit.performance.duty, 0), 0);
});

test("two closed material loops with net heater input have no steady state without ambient losses", () => {
  const nodes = [heater(), exchanger("E"), exchanger("B")];
  const edges = [supply, returning, pipe("E", "B", "cold-out", "cold-in"), pipe("B", "E", "cold-out", "cold-in")];
  // B's hot side is stopped from transferring heat; the two circulating fluids
  // can exchange energy, but neither can reject net heater input.
  nodes[2].data.running = false;
  const result = resolvePlant(nodes, edges);
  assert.match(result.get("H").calculationError, /No steady-state temperature/);
});
