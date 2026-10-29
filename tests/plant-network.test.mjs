import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultHeatExchangerData, heatExchangerPerformance, thermalProperties } from "../.test-build/equipment/HeatExchanger/model.js";
import { isValidPlantConnection, toPlantEdge } from "../.test-build/connections.js";
import { pipePerformance, resolvePlant } from "../.test-build/network.js";

const unit = (id, patch = {}) => ({ id, type: "heatExchanger", position: { x: 0, y: 0 }, data: { ...defaultHeatExchangerData(id), running: true, ...patch } });
const connection = (source, target, sourceHandle = "hot-out", targetHandle = "hot-in") => ({ source, target, sourceHandle, targetHandle });
const pipe = (...args) => toPlantEdge(connection(...args));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("series temperatures, mass flow and Cp propagate through three units regardless of array order", () => {
  for (const stream of ["hot", "cold"]) {
    const a = unit("A", { thermal: { [`${stream}SpecificHeat`]: 2.5 }, [`${stream}Flow`]: 7 });
    const b = unit("B");
    const c = unit("C");
    const edges = [pipe("B", "C", `${stream}-out`, `${stream}-in`), pipe("A", "B", `${stream}-out`, `${stream}-in`)];
    const result = resolvePlant([c, b, a], edges);
    close(result.get("B").data[`${stream}In`], heatExchangerPerformance(a.data)[`${stream}Out`]);
    close(result.get("C").data[`${stream}In`], result.get("B").performance[`${stream}Out`]);
    assert.equal(result.get("C").data[`${stream}Flow`], 7);
    assert.equal(thermalProperties(result.get("C").data)[`${stream}SpecificHeat`], 2.5);
    // Whole train energy balance: heat removed from hot = heat gained by cold.
    let hotLoss = 0, coldGain = 0;
    for (const { data, performance } of result.values()) {
      const cp = thermalProperties(data);
      hotLoss += data.hotFlow * cp.hotSpecificHeat * (data.hotIn - performance.hotOut);
      coldGain += data.coldFlow * cp.coldSpecificHeat * (performance.coldOut - data.coldIn);
    }
    close(hotLoss, coldGain);
    const updated = resolvePlant([c, b, { ...a, data: { ...a.data, [`${stream}In`]: 200 } }], edges);
    assert.notEqual(updated.get("C").data[`${stream}In`], result.get("C").data[`${stream}In`]);
  }
});

test("both streams can be linked and independent upstream feeds are resolved", () => {
  const result = resolvePlant([unit("C"), unit("B", { coldIn: 10 }), unit("A")], [pipe("A", "C"), pipe("B", "C", "cold-out", "cold-in")]);
  close(result.get("C").data.hotIn, result.get("A").performance.hotOut);
  close(result.get("C").data.coldIn, result.get("B").performance.coldOut);
  assert.equal(resolvePlant([unit("A"), unit("B")], [pipe("A", "B"), pipe("A", "B", "cold-out", "cold-in")]).size, 2);
});

test("reverse drags normalize direction and stream sides may change between exchangers", () => {
  const edge = toPlantEdge(connection("B", "A", "cold-in", "hot-out"));
  assert.equal(edge.source, "A");
  assert.equal(edge.target, "B");
  assert.equal(edge.data.stream, "hot");
  const result = resolvePlant([unit("A", { thermal: { hotSpecificHeat: 2 } }), unit("B")], [edge]);
  close(result.get("B").data.coldIn, result.get("A").performance.hotOut);
  assert.equal(result.get("B").data.coldFlow, 4);
  assert.equal(thermalProperties(result.get("B").data).coldSpecificHeat, 2);
});

test("disconnecting restores saved inputs and resolution never mutates nodes or edges", () => {
  const nodes = [unit("A"), unit("B", { hotIn: 120, hotFlow: 8, thermal: { hotSpecificHeat: 3 } })];
  const edges = [pipe("A", "B")];
  const before = structuredClone({ nodes, edges });
  resolvePlant(nodes, edges);
  assert.deepEqual({ nodes, edges }, before);
  const detached = resolvePlant(nodes, []).get("B");
  assert.equal(detached.data.hotIn, 120);
  assert.equal(detached.data.hotFlow, 8);
  assert.equal(thermalProperties(detached.data).hotSpecificHeat, 3);
  assert.deepEqual(detached.inlets, {});
  assert.equal(resolvePlant([nodes[1]], []).get("B").data.hotIn, 120);
});

test("stopped exchangers pass inlet temperature through; zero flow propagates zero duty", () => {
  const stopped = resolvePlant([unit("A", { running: false }), unit("B")], [pipe("A", "B")]);
  assert.equal(stopped.get("B").data.hotIn, 150);
  const zero = resolvePlant([unit("A", { hotFlow: 0 }), unit("B")], [pipe("A", "B")]);
  assert.equal(zero.get("B").data.hotFlow, 0);
  assert.equal(zero.get("B").performance.duty, 0);
});

test("pipe analytic reference, energy balance and ambient limits", () => {
  const options = { thermalConductance: 2000 * Math.log(2), ambientTemperature: 20 };
  const result = pipePerformance(100, 1, 2, options);
  close(result.outlet, 60);
  close(result.heatLoss, 80);
  assert.deepEqual(pipePerformance(100, 1, 2), { outlet: 100, heatLoss: 0 });
  assert.deepEqual(pipePerformance(100, 0, 2, options), { outlet: 100, heatLoss: 0 });
  assert.equal(pipePerformance(20, 1, 2, options).outlet, 20);
  const warming = pipePerformance(-20, 1, 2, options);
  close(warming.outlet, 0);
  close(warming.heatLoss, -40);
  assert.equal(pipePerformance(100, 1e-10, 2, options).outlet, 20);
  const colder = pipePerformance(100, 0.5, 2, options);
  assert.ok(colder.outlet < result.outlet && colder.outlet >= 20);
  const nodes = [unit("A"), unit("B"), unit("C")];
  const first = { ...pipe("A", "B"), data: { stream: "hot", ...options } };
  const network = resolvePlant(nodes, [first, pipe("B", "C")]);
  const upstream = network.get("A");
  const expected = pipePerformance(upstream.performance.hotOut, upstream.data.hotFlow, 4.18, options);
  close(network.get("B").data.hotIn, expected.outlet);
  close(network.get("B").inlets.hot.heatLoss, expected.heatLoss);
  close(network.get("C").data.hotIn, network.get("B").performance.hotOut);
});

test("invalid pipe inputs are rejected", () => {
  for (const params of [[NaN, 1, 2], [100, -1, 2], [100, 1, 0], [100, 1, 2, { thermalConductance: -1 }], [100, 1, 2, { ambientTemperature: Infinity }]]) {
    assert.throws(() => pipePerformance(...params), RangeError);
  }
});

test("invalid nozzles, splits and mixing are rejected", () => {
  const ab = pipe("A", "B");
  const bc = pipe("B", "C");
  for (const candidate of [connection("A", "A"), connection("A", "B", "hot-in", "cold-in"), connection("A", "B", "hot-out", "cold-out"), connection("A", "B", null), connection("A", "C"), connection("C", "B")]) {
    assert.equal(isValidPlantConnection(candidate, [ab, bc]), false);
  }
  assert.throws(() => toPlantEdge(connection("A", "B", "hot-in", "cold-in")), RangeError);
  const nodes = [unit("A"), unit("B"), unit("C")];
  for (const edges of [[ab, pipe("A", "C")], [ab, pipe("C", "B")], [pipe("A", "missing")]]) {
    assert.throws(() => resolvePlant(nodes, edges), RangeError);
  }
});
