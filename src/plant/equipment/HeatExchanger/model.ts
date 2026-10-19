import type { HeatExchangerData, HeatExchangerDesign, HeatExchangerThermalProperties } from "./types";

// NPTEL Chemical Engineering Design II, mod1.pdf, pp. 14-24.
// Single-phase, constant mean/caloric-temperature properties, no ambient losses.
// Film coefficients must be evaluated for the actual operating point (the PDF
// uses external jH charts). Baffle geometry alone cannot determine a coefficient.
export const defaultHeatExchangerThermalProperties: Readonly<HeatExchangerThermalProperties> = Object.freeze({
  hotSpecificHeat: 4.18,
  coldSpecificHeat: 4.18,
  tubeOuterDiameter: 0.01905,
  tubeInnerDiameter: 0.01575,
  wallConductivity: 16,
  shellFilmCoefficient: 1000,
  tubeFilmCoefficient: 3000,
  shellFoulingResistance: 0.0002,
  tubeFoulingResistance: 0.0002,
});

function positive(name: string, value: number, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${name} must be finite and ${allowZero ? "non-negative" : "positive"}.`);
  }
}

function validateArrangement({ tubePasses, arrangement }: Pick<HeatExchangerDesign, "tubePasses" | "arrangement">) {
  if (tubePasses !== 1 && tubePasses !== 2) throw new RangeError("Tube passes must be 1 or 2.");
  if (arrangement !== "counter" && arrangement !== "parallel") throw new RangeError("Unknown flow arrangement.");
}

export function thermalProperties({ thermal }: HeatExchangerDesign): HeatExchangerThermalProperties {
  const properties = { ...defaultHeatExchangerThermalProperties, ...thermal };
  for (const [name, value] of Object.entries(properties)) {
    positive(name, value, name === "shellFoulingResistance" || name === "tubeFoulingResistance");
  }
  if (properties.tubeInnerDiameter >= properties.tubeOuterDiameter) {
    throw new RangeError("Tube inner diameter must be smaller than outer diameter.");
  }
  return properties;
}

export const defaultHeatExchangerDesign: HeatExchangerDesign = {
  tubes: 120,
  tubeLength: 4,
  tubePasses: 1,
  arrangement: "counter",
  baffles: 5,
  baffleCut: 25,
};

export const defaultHeatExchangerData = (label: string): HeatExchangerData => ({
  ...defaultHeatExchangerDesign,
  label,
  running: false,
  collapsed: false,
  hotIn: 150,
  coldIn: 25,
  hotFlow: 4,
  coldFlow: 5,
});

export function shellSideCoefficient(design: HeatExchangerDesign) {
  return thermalProperties(design).shellFilmCoefficient;
}

/** Uo on outside tube area. Inner film/fouling scale by Ao/Ai = do/di. */
export function overallCoefficient(design: HeatExchangerDesign) {
  const p = thermalProperties(design);
  const ratio = p.tubeOuterDiameter / p.tubeInnerDiameter;
  // Exact cylindrical conduction; the PDF uses a thin-wall approximation and
  // incorrectly substitutes a squared diameter ratio in its worked example.
  const wallResistance = p.tubeOuterDiameter * Math.log(ratio) / (2 * p.wallConductivity);
  return 1 / (1 / p.shellFilmCoefficient + p.shellFoulingResistance + wallResistance
    + ratio * (1 / p.tubeFilmCoefficient + p.tubeFoulingResistance));
}

/** Outside heat-transfer area, m² (total tubes, not tubes per pass). */
export function heatTransferArea(design: HeatExchangerDesign) {
  positive("Tube count", design.tubes);
  if (!Number.isInteger(design.tubes)) throw new RangeError("Tube count must be an integer.");
  positive("Tube length", design.tubeLength);
  return design.tubes * Math.PI * thermalProperties(design).tubeOuterDiameter * design.tubeLength;
}

/** Eq. 1.5: h = jH k/D Pr^(1/3) (mu/muWall)^0.14, in W/(m² K).
 * jH is the heat-transfer factor used in the PDF, not the Colburn j factor.
 * Supply the chart value for the geometry and Reynolds number; cp is kJ/(kg K),
 * conductivity W/(m K), viscosity Pa s, diameter m.
 */
export function filmCoefficientFromHeatTransferFactor(
  jH: number, diameter: number, conductivity: number, specificHeat: number,
  viscosity: number, wallViscosity = viscosity,
) {
  for (const [name, value] of Object.entries({ jH, diameter, conductivity, specificHeat, viscosity, wallViscosity })) {
    positive(name, value);
  }
  const prandtl = specificHeat * 1000 * viscosity / conductivity;
  return jH * conductivity / diameter * Math.cbrt(prandtl) * (viscosity / wallViscosity) ** 0.14;
}

/** Eqs. 1.3-1.4. massFlow kg/s, density kg/m³, viscosity Pa s. */
export function tubeSideHydraulics(design: HeatExchangerDesign, massFlow: number, density: number, viscosity: number) {
  heatTransferArea(design); // Validate tube geometry.
  validateArrangement(design);
  positive("Mass flow", massFlow, true);
  positive("Density", density);
  positive("Viscosity", viscosity);
  const { tubeInnerDiameter: diameter } = thermalProperties(design);
  const flowArea = design.tubes / design.tubePasses * Math.PI * diameter ** 2 / 4;
  const velocity = massFlow / (density * flowArea);
  return { flowArea, velocity, reynolds: density * velocity * diameter / viscosity };
}

/** ε-NTU relations: counter/parallel flow for one tube pass, 1 shell – 2 tube passes otherwise. */
export function effectiveness(ntu: number, cr: number, { tubePasses, arrangement }: HeatExchangerDesign) {
  validateArrangement({ tubePasses, arrangement });
  if (Number.isNaN(ntu) || ntu < 0) throw new RangeError("NTU must be non-negative.");
  if (!Number.isFinite(cr) || cr < 0 || cr > 1) throw new RangeError("Capacity ratio must be between 0 and 1.");
  if (ntu === 0) return 0;
  if (tubePasses === 2) {
    const root = Math.sqrt(1 + cr * cr);
    const tanh = Math.tanh(ntu * root / 2);
    return 2 * tanh / ((1 + cr) * tanh + root);
  }
  if (arrangement === "parallel") return -Math.expm1(-ntu * (1 + cr)) / (1 + cr);
  if (cr === 1) return ntu === Infinity ? 1 : ntu / (1 + ntu);
  const oneMinusExp = -Math.expm1(-ntu * (1 - cr));
  return oneMinusExp / (1 - cr + cr * oneMinusExp);
}

/** Signed LMTD, K. Equal terminal differences use the analytic limit. */
export function logMeanTemperatureDifference(delta1: number, delta2: number) {
  if (!Number.isFinite(delta1) || !Number.isFinite(delta2)) throw new RangeError("Temperature differences must be finite.");
  if ((delta1 < 0 && delta2 > 0) || (delta1 > 0 && delta2 < 0)) {
    throw new RangeError("Terminal temperature differences must have the same sign.");
  }
  if (delta1 === 0 || delta2 === 0) return 0;
  const a = Math.abs(delta1);
  const b = Math.abs(delta2);
  const mean = Math.abs(a - b) <= 1e-8 * Math.max(a, b)
    ? (a + b) / 2
    : (a - b) / (Math.log(a) - Math.log(b));
  return Math.sign(delta1) * mean;
}

export interface TerminalTemperatures {
  hotIn: number;
  hotOut: number;
  coldIn: number;
  coldOut: number;
}

/** One-shell/two-tube-pass FT, including the equal-capacity-rate limit.
 * Obtained by inverting the one-shell effectiveness relation; single-pass FT=1
 * uses that arrangement's own LMTD. Infeasible terminal temperatures are rejected.
 */
export function lmtdCorrectionFactor(t: TerminalTemperatures, design: HeatExchangerDesign) {
  validateArrangement(design);
  for (const value of [t.hotIn, t.hotOut, t.coldIn, t.coldOut]) {
    if (!Number.isFinite(value)) throw new RangeError("Temperatures must be finite.");
  }
  const sign = Math.sign(t.hotIn - t.coldIn);
  const difference = Math.abs(t.hotIn - t.coldIn);
  const hotDrop = sign * (t.hotIn - t.hotOut);
  const coldRise = sign * (t.coldOut - t.coldIn);
  if (t.hotIn === t.hotOut && t.coldIn === t.coldOut) return 1;
  if (hotDrop <= 0 || coldRise <= 0 || Math.max(hotDrop, coldRise) >= difference) {
    throw new RangeError("Terminal temperatures are not feasible for finite single-phase capacity rates.");
  }
  if (design.tubePasses === 1) {
    if (design.arrangement === "parallel" && sign * (t.hotOut - t.coldOut) <= 0) {
      throw new RangeError("Parallel-flow outlets cannot cross or meet at finite NTU.");
    }
    return 1;
  }
  const maximumChange = Math.max(hotDrop, coldRise);
  const cr = Math.min(hotDrop, coldRise) / maximumChange;
  const eff = maximumChange / difference;
  const root = Math.sqrt(1 + cr * cr);
  const tanh = eff * root / (2 - eff * (1 + cr));
  if (tanh >= 1) throw new RangeError("Terminal temperatures exceed the one-shell-pass effectiveness limit.");
  const ntu = 2 * Math.atanh(tanh) / root;
  const lmtd = Math.abs(logMeanTemperatureDifference(t.hotIn - t.coldOut, t.hotOut - t.coldIn));
  return maximumChange / (ntu * lmtd);
}

/** Eq. 1.1, sizing from positive duty kW, Uo W/(m² K), LMTD K and FT. */
export function requiredHeatTransferArea(duty: number, u: number, lmtd: number, correctionFactor = 1) {
  positive("Duty", duty, true);
  positive("Overall coefficient", u);
  positive("LMTD", lmtd);
  positive("LMTD correction factor", correctionFactor);
  if (correctionFactor > 1) throw new RangeError("LMTD correction factor cannot exceed 1.");
  return duty * 1000 / (u * lmtd * correctionFactor);
}

export function heatExchangerPerformance(data: HeatExchangerData) {
  validateArrangement(data);
  positive("Hot flow", data.hotFlow, true);
  positive("Cold flow", data.coldFlow, true);
  if (!Number.isFinite(data.hotIn) || !Number.isFinite(data.coldIn)) throw new RangeError("Inlet temperatures must be finite.");
  const properties = thermalProperties(data);
  const area = heatTransferArea(data);
  const u = overallCoefficient(data);
  const cHot = data.hotFlow * properties.hotSpecificHeat;
  const cCold = data.coldFlow * properties.coldSpecificHeat;
  const cMin = Math.min(cHot, cCold);
  const cMax = Math.max(cHot, cCold);
  const ntu = cMin > 0 ? (u * area) / (cMin * 1000) : 0;
  const eff = cMin > 0 ? effectiveness(ntu, cMin / cMax, data) : 0;
  const duty = data.running ? eff * cMin * (data.hotIn - data.coldIn) : 0; // kW
  const hotOut = cHot > 0 ? data.hotIn - duty / cHot : data.hotIn;
  const coldOut = cCold > 0 ? data.coldIn + duty / cCold : data.coldIn;
  const operating = data.running && cMin > 0;
  // Q/(UA) preserves the single-pass LMTD at high NTU, where subtracting
  // rounded outlet temperatures can give a zero or negative terminal approach.
  // Diagnostics are undefined when stopped or when a stream has no flow.
  const correctedMean = operating ? duty * 1000 / (u * area) : null;
  const lmtd = !operating ? null : data.tubePasses === 1 ? correctedMean
    : logMeanTemperatureDifference(data.hotIn - coldOut, hotOut - data.coldIn);
  const correctionFactor = lmtd === null ? null : data.tubePasses === 1 || lmtd === 0
    ? 1 : Math.min(1, Math.abs(correctedMean! / lmtd));

  return {
    area,
    u,
    ntu,
    effectiveness: eff,
    duty,
    hotOut,
    coldOut,
    lmtd,
    correctionFactor,
    correctedMeanTemperatureDifference: correctedMean,
  };
}

/** Thermal colour within a range: coldest is blue, then cyan, green, yellow, hottest is red. */
export function temperatureColor(celsius: number, coldest = 0, hottest = 200) {
  const span = hottest - coldest;
  const fraction = span > 0 ? Math.min(1, Math.max(0, (celsius - coldest) / span)) : 0.5;
  return `hsl(${Math.round(220 * (1 - fraction))} 85% 50%)`;
}
