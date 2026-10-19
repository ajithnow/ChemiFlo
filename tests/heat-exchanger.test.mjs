import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultHeatExchangerData, defaultHeatExchangerDesign, defaultHeatExchangerThermalProperties,
  effectiveness, filmCoefficientFromHeatTransferFactor, heatExchangerPerformance,
  heatTransferArea, lmtdCorrectionFactor, logMeanTemperatureDifference,
  overallCoefficient, requiredHeatTransferArea, shellSideCoefficient,
  thermalProperties, tubeSideHydraulics,
} from "../.test-build/heat-exchanger/model.js";

const design = (patch = {}) => ({ ...defaultHeatExchangerDesign, ...patch });
const process = (patch = {}) => ({ ...defaultHeatExchangerData("E-test"), running: true, ...patch });
function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual), `Non-finite result: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tolerance ${tolerance})`);
}

// Independent unit conversions for the NPTEL gasoline/kerosene example, pp. 17-24.
const BTU = 1055.05585262; // international-table Btu, J
const FOOT = 0.3048;
const POUND = 0.45359237;
const H_UNIT = BTU / 3600 / FOOT ** 2 * 1.8;
const K_UNIT = BTU / 3600 / FOOT * 1.8;
const CP_UNIT = BTU / POUND * 1.8 / 1000;
const celsius = f => (f - 32) / 1.8;
const exampleTemperatures = { hotIn: celsius(160), hotOut: celsius(120), coldIn: celsius(75), coldOut: celsius(120) };
const exampleDesign = design({
  tubes: 518, tubeLength: 16 * FOOT, tubePasses: 2,
  thermal: {
    tubeOuterDiameter: 0.0254, tubeInnerDiameter: 0.834 * 0.0254,
    hotSpecificHeat: 0.57 * CP_UNIT, coldSpecificHeat: 0.48 * CP_UNIT,
    wallConductivity: 70 * K_UNIT,
    shellFilmCoefficient: 155.3 * H_UNIT, tubeFilmCoefficient: 141.3 * H_UNIT,
    shellFoulingResistance: 0.0005 / H_UNIT, tubeFoulingResistance: 0.001 / H_UNIT,
  },
});

test("PDF energy balance: kerosene gains 3,240,000 Btu/h (949.550267 kW)", () => {
  const coldFlow = 150000 * POUND / 3600;
  const hotFlow = 3240000 / (0.57 * 40) * POUND / 3600;
  const p = thermalProperties(exampleDesign);
  const coldDuty = coldFlow * p.coldSpecificHeat * (exampleTemperatures.coldOut - exampleTemperatures.coldIn);
  const hotDuty = hotFlow * p.hotSpecificHeat * (exampleTemperatures.hotIn - exampleTemperatures.hotOut);
  close(coldDuty, 949.550267358, 1e-8);
  close(hotDuty, coldDuty, 1e-8);
});

test("PDF terminal temperatures: corrected arithmetic gives LMTD 42.450935 F, FT 0.8023645", () => {
  const lmtd = logMeanTemperatureDifference(
    exampleTemperatures.hotIn - exampleTemperatures.coldOut,
    exampleTemperatures.hotOut - exampleTemperatures.coldIn,
  );
  close(lmtd * 1.8, 42.45093507851881);
  close(lmtdCorrectionFactor(exampleTemperatures, exampleDesign), 0.8023645281937326);
  const area = requiredHeatTransferArea(949.550267358, 45 * H_UNIT, lmtd, 0.8023645281937326);
  close(area / FOOT ** 2, 2113.846828785034, 1e-8);
  // The printed 42.75 F / 2100 ft² are rounded/inconsistent; do not lock in those errors.
});

test("PDF geometry: total outside area and tubes per pass are distinct", () => {
  close(heatTransferArea(exampleDesign) / FOOT ** 2, 2169.79332607935, 1e-8);
  close(heatTransferArea({ ...exampleDesign, tubePasses: 1 }), heatTransferArea(exampleDesign));
  const flow = tubeSideHydraulics(exampleDesign, 150000 * POUND / 3600, 800, 0.0016);
  close(flow.reynolds, 2741.227648192909, 1e-8);
  close(flow.reynolds, 2740.2, 1.1); // PDF rounds imperial viscosity to 3.872 lb/(ft h).
  const singlePass = tubeSideHydraulics({ ...exampleDesign, tubePasses: 1 }, 150000 * POUND / 3600, 800, 0.0016);
  close(flow.velocity, 2 * singlePass.velocity);
  close(flow.flowArea, singlePass.flowArea / 2);
});

test("PDF chart factors reproduce the tube and shell film coefficients", () => {
  const tube = filmCoefficientFromHeatTransferFactor(42, 0.834 * 0.0254, 0.083 * K_UNIT, 0.48 * CP_UNIT, 0.0016);
  const shell = filmCoefficientFromHeatTransferFactor(110, 0.082 * FOOT, 0.075 * K_UNIT, 0.57 * CP_UNIT, 0.0002);
  close(tube / H_UNIT, 141.3, 0.15);
  close(shell / H_UNIT, 155.3, 0.15);
  close(filmCoefficientFromHeatTransferFactor(42, 0.02, 0.15, 2, 0.002, 0.001)
    / filmCoefficientFromHeatTransferFactor(42, 0.02, 0.15, 2, 0.002), 2 ** 0.14);
});

test("outside-area U includes exact wall conduction and linear do/di ratio", () => {
  close(overallCoefficient(exampleDesign), 339.365083861519, 1e-8);
  // Corrected result is 59.765647 Btu/(h ft² F), not the PDF's squared-ratio 53.5.
  close(overallCoefficient(exampleDesign) / H_UNIT, 59.76564725421324);
});

test("complete equal-capacity counterflow rating matches an independent hand calculation", () => {
  const result = heatExchangerPerformance(process({
    tubes: 100, tubeLength: 5, hotIn: 150, coldIn: 50, hotFlow: 2, coldFlow: 4,
    thermal: {
      tubeOuterDiameter: 0.02, tubeInnerDiameter: 0.016, wallConductivity: 16,
      hotSpecificHeat: 4, coldSpecificHeat: 2, shellFilmCoefficient: 1500,
      tubeFilmCoefficient: 2500, shellFoulingResistance: 0.0001, tubeFoulingResistance: 0.0002,
    },
  }));
  close(result.area, 31.41592653589793);
  close(result.u, 603.8168277648128);
  close(result.ntu, 2.3711831377747865);
  close(result.duty, 562.6945890195526);
  close(result.hotOut, 79.66317637255592);
  close(result.coldOut, 120.33682362744408);
  close(result.lmtd, 29.66317637255592);
  close(result.correctionFactor, 1);
});

for (const [name, configuration, expected] of [
  ["counter", {}, 0.5647334016064162],
  ["parallel", { arrangement: "parallel" }, 0.5179132265677134],
  ["one shell / two tube passes", { tubePasses: 2 }, 0.5399395561060546],
]) {
  test(`${name}: effectiveness at NTU=1, Cr=0.5`, () => {
    close(effectiveness(1, 0.5, design(configuration)), expected);
  });
  test(`${name}: zero, tiny, infinite NTU and capacity ratio limits`, () => {
    const d = design(configuration);
    close(effectiveness(0, 0.5, d), 0);
    close(effectiveness(1e-16, 0.5, d) / 1e-16, 1);
    close(effectiveness(1, 0, d), 0.6321205588285577);
    const limit = configuration.tubePasses === 2 ? 2 / (1.5 + Math.sqrt(1.25))
      : configuration.arrangement === "parallel" ? 2 / 3 : 1;
    close(effectiveness(Infinity, 0.5, d), limit);
    close(effectiveness(1, 1 - 1e-12, d), effectiveness(1, 1, d), 1e-11);
  });
  test(`${name}: energy conservation, temperature bounds and independent LMTD balance`, () => {
    for (const [hotFlow, coldFlow] of [[4, 5], [1, 8], [8, 1], [2, 4]]) {
      const input = process({ ...configuration, hotFlow, coldFlow, thermal: { hotSpecificHeat: 3, coldSpecificHeat: 1.5 } });
      const p = heatExchangerPerformance(input);
      close(hotFlow * 3 * (input.hotIn - p.hotOut), p.duty, 1e-8);
      close(coldFlow * 1.5 * (p.coldOut - input.coldIn), p.duty, 1e-8);
      close(p.u * p.area * p.lmtd * p.correctionFactor / 1000, p.duty, 1e-8);
      const parallel = input.tubePasses === 1 && input.arrangement === "parallel";
      close(logMeanTemperatureDifference(input.hotIn - (parallel ? input.coldIn : p.coldOut),
        p.hotOut - (parallel ? p.coldOut : input.coldIn)), p.lmtd, 1e-8);
      close(lmtdCorrectionFactor({ ...input, hotOut: p.hotOut, coldOut: p.coldOut }, input), p.correctionFactor, 1e-8);
      assert.ok(p.duty <= Math.min(hotFlow * 3, coldFlow * 1.5) * (input.hotIn - input.coldIn));
      assert.ok(p.effectiveness >= 0 && p.effectiveness <= 1);
      assert.ok(p.hotOut >= input.coldIn && p.hotOut <= input.hotIn);
      assert.ok(p.coldOut >= input.coldIn && p.coldOut <= input.hotIn);
    }
  });
}

test("counterflow equal capacities and large NTU use finite analytic limits", () => {
  close(effectiveness(2, 1, design()), 2 / 3);
  close(effectiveness(Infinity, 1, design()), 1);
  close(effectiveness(1e6, 1 - 1e-8, design()), 0.9999990049926616, 1e-12);
});

test("very low flows retain finite driving forces and do not crash when outlets round to a pinch", () => {
  for (const arrangement of ["counter", "parallel"]) {
    for (const tubePasses of [1, 2]) {
      for (const hotFlow of [1e-6, 0.001, 0.5, 4, 100]) {
        for (const coldFlow of [1e-6, 0.001, 0.5, 5, 100]) {
          const p = heatExchangerPerformance(process({ arrangement, tubePasses, hotFlow, coldFlow }));
          for (const value of Object.values(p)) assert.ok(Number.isFinite(value));
          assert.ok(p.lmtd > 0);
          assert.ok(p.correctionFactor > 0 && p.correctionFactor <= 1);
          close(p.u * p.area * p.lmtd * p.correctionFactor / 1000, p.duty, 1e-8);
        }
      }
    }
  }
});

test("two-pass flow ignores the single-pass arrangement selector", () => {
  assert.deepEqual(heatExchangerPerformance(process({ tubePasses: 2 })),
    heatExchangerPerformance(process({ tubePasses: 2, arrangement: "parallel" })));
});

test("LMTD handles equal, nearly equal, zero and reversed temperature differences", () => {
  close(logMeanTemperatureDifference(40, 40), 40);
  close(logMeanTemperatureDifference(40, 40 + 1e-10), 40 + 0.5e-10);
  close(logMeanTemperatureDifference(40, 0), 0);
  close(logMeanTemperatureDifference(0, 0), 0);
  close(logMeanTemperatureDifference(-40, -45), -42.45093507851881);
  assert.throws(() => logMeanTemperatureDifference(10, -1), RangeError);
  assert.throws(() => logMeanTemperatureDifference(NaN, 1), RangeError);
});

test("FT handles equal capacities and reversed temperatures without R=1 singularities", () => {
  close(lmtdCorrectionFactor({ hotIn: 100, hotOut: 60, coldIn: 0, coldOut: 40 }, design({ tubePasses: 2 })), 0.9209374852565487);
  close(lmtdCorrectionFactor({ hotIn: 0, hotOut: 40, coldIn: 100, coldOut: 60 }, design({ tubePasses: 2 })), 0.9209374852565487);
  close(lmtdCorrectionFactor({ hotIn: 50, hotOut: 50, coldIn: 50, coldOut: 50 }, design({ tubePasses: 2 })), 1);
});

test("FT rejects physically impossible terminal temperatures", () => {
  assert.throws(() => lmtdCorrectionFactor({ hotIn: 100, hotOut: 10, coldIn: 0, coldOut: 90 }, design({ tubePasses: 2 })), RangeError);
  assert.throws(() => lmtdCorrectionFactor({ hotIn: 100, hotOut: 40, coldIn: 0, coldOut: 60 }, design({ arrangement: "parallel" })), RangeError);
  assert.throws(() => lmtdCorrectionFactor({ hotIn: 100, hotOut: 110, coldIn: 0, coldOut: 10 }, design()), RangeError);
  assert.throws(() => lmtdCorrectionFactor({ hotIn: 100, hotOut: NaN, coldIn: 0, coldOut: 10 }, design()), RangeError);
});

for (const patch of [{ running: false }, { hotFlow: 0 }, { coldFlow: 0 }, { hotFlow: 0, coldFlow: 0 }]) {
  test(`no transfer when ${JSON.stringify(patch)}`, () => {
    const input = process(patch);
    const p = heatExchangerPerformance(input);
    close(p.duty, 0);
    close(p.hotOut, input.hotIn);
    close(p.coldOut, input.coldIn);
    assert.equal(p.lmtd, null);
    assert.equal(p.correctionFactor, null);
    assert.equal(p.correctedMeanTemperatureDifference, null);
    for (const value of Object.values(p)) assert.ok(value === null || Number.isFinite(value));
  });
}

test("equal inlet temperatures give zero duty and zero driving force", () => {
  const p = heatExchangerPerformance(process({ hotIn: 40, coldIn: 40, tubePasses: 2 }));
  close(p.duty, 0);
  close(p.lmtd, 0);
  close(p.correctionFactor, 1);
});

test("reversed inlet temperatures reverse duty while conserving energy", () => {
  for (const d of [design(), design({ arrangement: "parallel" }), design({ tubePasses: 2 })]) {
    const input = process({ ...d, hotIn: 25, coldIn: 150 });
    const p = heatExchangerPerformance(input);
    assert.ok(p.duty < 0);
    close(input.hotFlow * 4.18 * (input.hotIn - p.hotOut), p.duty);
    close(input.coldFlow * 4.18 * (p.coldOut - input.coldIn), p.duty);
    close(p.u * p.area * p.lmtd * p.correctionFactor / 1000, p.duty);
  }
});

test("more fouling and poorer wall conductivity lower U and duty", () => {
  const baseline = heatExchangerPerformance(process());
  for (const thermal of [{ tubeFoulingResistance: 0.001 }, { shellFoulingResistance: 0.001 }, { wallConductivity: 1 }]) {
    const result = heatExchangerPerformance(process({ thermal }));
    assert.ok(result.u < baseline.u);
    assert.ok(result.duty < baseline.duty);
  }
});

test("legacy designs resolve defaults; partial thermal edits preserve other defaults", () => {
  assert.deepEqual(thermalProperties(design()), defaultHeatExchangerThermalProperties);
  const configured = thermalProperties(design({ thermal: { hotSpecificHeat: 2 } }));
  assert.equal(configured.hotSpecificHeat, 2);
  assert.equal(configured.coldSpecificHeat, 4.18);
  assert.equal(defaultHeatExchangerThermalProperties.hotSpecificHeat, 4.18);
  close(shellSideCoefficient(design({ thermal: { shellFilmCoefficient: 750 } })), 750);
  close(shellSideCoefficient(design({ baffles: 0, baffleCut: 45 })), 1000);
});

test("sizing validates units and impossible inputs", () => {
  close(requiredHeatTransferArea(100, 500, 20, 0.8), 12.5);
  close(requiredHeatTransferArea(0, 500, 20), 0);
  for (const args of [[-1, 500, 20], [100, 0, 20], [100, 500, 0], [100, 500, 20, 0], [100, 500, 20, 1.1]]) {
    assert.throws(() => requiredHeatTransferArea(...args), RangeError);
  }
});

test("invalid flows, temperatures, geometry and thermal properties are rejected", () => {
  for (const patch of [
    { hotFlow: -1 }, { coldFlow: NaN }, { hotIn: Infinity }, { coldIn: NaN },
    { tubes: 0 }, { tubes: 10.5 }, { tubeLength: 0 }, { tubePasses: 3 }, { arrangement: "cross" },
    { thermal: { hotSpecificHeat: 0 } }, { thermal: { tubeInnerDiameter: 0.03 } },
    { thermal: { wallConductivity: 0 } }, { thermal: { tubeFoulingResistance: -1 } },
    { thermal: { shellFilmCoefficient: Infinity } },
  ]) assert.throws(() => heatExchangerPerformance(process(patch)), RangeError, JSON.stringify(patch));
  for (const [ntu, cr] of [[-1, 0.5], [NaN, 0.5], [1, -0.1], [1, 1.1], [1, NaN]]) {
    assert.throws(() => effectiveness(ntu, cr, design()), RangeError);
  }
  assert.throws(() => tubeSideHydraulics(design(), 1, 0, 0.001), RangeError);
  assert.throws(() => filmCoefficientFromHeatTransferFactor(0, 0.02, 0.6, 4.18, 0.001), RangeError);
});
