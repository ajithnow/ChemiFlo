import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultHeaterData, heaterPerformance } from "../.test-build/equipment/Heater/model.js";
import { defaultHeatExchangerData } from "../.test-build/equipment/HeatExchanger/model.js";
import { isValidPlantConnection, toPlantEdge } from "../.test-build/connections.js";
import { resolvePlant } from "../.test-build/network.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const heater = (id, patch = {}) => ({ id, type: "heater", position: { x: 0, y: 0 }, data: { ...defaultHeaterData(id), running: true, ...patch } });
const exchanger = (id, patch = {}) => ({ id, type: "heatExchanger", position: { x: 0, y: 0 }, data: { ...defaultHeatExchangerData(id), running: true, ...patch } });
const pipe = (source, target, sourceHandle = "hot-out", targetHandle = "hot-in") => toPlantEdge({ source, target, sourceHandle, targetHandle });

test("heater reference: 41.8 kW raises 1 kg/s water from 25 to 35 °C", () => {
  const result = heaterPerformance(heater("H-1", { power: 41.8 }).data);
  close(result.outletTemperature, 35);
  close(result.temperatureRise, 10);
  close(result.duty, 41.8);
});

test("heater rise scales with power and inversely with flow and Cp", () => {
  const base = heater("H-1", { power: 200, massFlow: 2, specificHeat: 2 }).data;
  close(heaterPerformance(base).temperatureRise, 50);
  close(heaterPerformance({ ...base, power: 400 }).temperatureRise, 100);
  close(heaterPerformance({ ...base, massFlow: 4 }).temperatureRise, 25);
  close(heaterPerformance({ ...base, specificHeat: 4 }).temperatureRise, 25);
});

test("stopped, zero-flow and zero-power heaters have zero duty and pass inlet temperature through", () => {
  for (const patch of [{ running: false }, { massFlow: 0 }, { power: 0 }]) {
    const data = heater("H-1", patch).data;
    assert.deepEqual(heaterPerformance(data), { duty: 0, temperatureRise: 0, outletTemperature: data.inletTemperature });
  }
  assert.equal(defaultHeaterData("H-1").running, false);
});

test("heater rejects nonfinite inputs, negative flow/power and nonpositive Cp", () => {
  for (const patch of [{ inletTemperature: NaN }, { inletTemperature: Infinity }, { massFlow: -1 }, { massFlow: Infinity }, { power: -1 }, { power: Infinity }, { specificHeat: 0 }, { specificHeat: -1 }, { specificHeat: NaN }]) {
    assert.throws(() => heaterPerformance(heater("H-1", patch).data), RangeError);
  }
});

test("heater feeds an exchanger through a lossy pipe and updates with power and run state", () => {
  const h = heater("H-1", { power: 418, massFlow: 2 });
  const e = exchanger("E-1");
  const edge = pipe(h.id, e.id);
  // Half the temperature difference to ambient remains after the pipe.
  edge.data = { stream: "hot", thermalConductance: 8360 * Math.log(2), ambientTemperature: 25 };
  const result = resolvePlant([e, h], [edge]);
  close(result.get(h.id).performance.outletTemperature, 75);
  close(result.get(e.id).data.hotIn, 50);
  close(result.get(e.id).data.hotFlow, 2);
  close(result.get(e.id).inlets.hot.heatLoss, 209);
  const output = result.get(e.id);
  const hotEnergyAboveFeed = 2 * 4.18 * (output.performance.hotOut - h.data.inletTemperature);
  close(h.data.power, hotEnergyAboveFeed + output.performance.duty + output.inlets.hot.heatLoss);
  const changed = resolvePlant([e, heater(h.id, { power: 836, massFlow: 2 })], [edge]);
  close(changed.get(e.id).data.hotIn, 75);
  const stopped = resolvePlant([e, { ...h, data: { ...h.data, running: false } }], [edge]);
  close(stopped.get(e.id).data.hotIn, 25);
  close(stopped.get(e.id).performance.duty, 0);
});

test("exchanger → heater → exchanger inherits fluid properties across sides", () => {
  const nodes = [exchanger("A", { coldFlow: 3, thermal: { coldSpecificHeat: 2 } }), heater("H", { power: 60 }), exchanger("B")];
  const edges = [pipe("A", "H", "cold-out"), pipe("H", "B", "hot-out", "cold-in")];
  const result = resolvePlant(nodes, edges);
  const h = result.get("H");
  close(h.data.inletTemperature, result.get("A").performance.coldOut);
  close(h.data.massFlow, 3);
  close(h.data.specificHeat, 2);
  close(h.performance.temperatureRise, 10);
  close(result.get("B").data.coldIn, h.performance.outletTemperature);
  close(result.get("B").data.coldFlow, 3);
  close(result.get("B").data.thermal.coldSpecificHeat, 2);
});

test("heaters in series add their duties and leave saved inputs intact", () => {
  const nodes = [heater("A", { power: 41.8 }), heater("B", { inletTemperature: 10, massFlow: 5, specificHeat: 2, power: 83.6 })];
  const before = structuredClone(nodes);
  const result = resolvePlant(nodes, [pipe("A", "B")]);
  close(result.get("B").performance.outletTemperature, 55);
  assert.deepEqual(nodes, before);
  const disconnected = resolvePlant(nodes, []).get("B");
  assert.equal(disconnected.data.inletTemperature, 10);
  assert.equal(disconnected.data.massFlow, 5);
  assert.equal(disconnected.data.specificHeat, 2);
  close(disconnected.performance.outletTemperature, 18.36);
});

test("zero inherited flow prevents downstream heater duty", () => {
  const result = resolvePlant([exchanger("E", { hotFlow: 0 }), heater("H")], [pipe("E", "H")]);
  assert.equal(result.get("H").data.massFlow, 0);
  assert.equal(result.get("H").performance.duty, 0);
});

test("heater connections support reverse dragging but reject nonexistent ports", () => {
  const nodes = [heater("H"), exchanger("E")];
  const reverse = { source: "E", target: "H", sourceHandle: "hot-in", targetHandle: "hot-out" };
  assert.equal(isValidPlantConnection(reverse, [], nodes), true);
  assert.equal(toPlantEdge(reverse).source, "H");
  for (const edge of [pipe("H", "E", "cold-out"), pipe("E", "H", "hot-out", "cold-in")]) {
    assert.equal(isValidPlantConnection(edge, [], nodes), false);
    assert.throws(() => resolvePlant(nodes, [edge]), RangeError);
  }
  assert.equal(isValidPlantConnection(pipe("E", "H"), [pipe("H", "E")], nodes), true);
});
