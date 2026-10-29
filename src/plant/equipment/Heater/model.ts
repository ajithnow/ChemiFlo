import type { HeaterData } from "./types";

export const defaultHeaterData = (label: string): HeaterData => ({
  label,
  running: false,
  inletTemperature: 25,
  massFlow: 1,
  specificHeat: 4.18,
  power: 100,
});

/** Steady single-phase heating: Q = m Cp (Tout - Tin). No boiling or stored heat. */
export function heaterPerformance(data: HeaterData) {
  const { inletTemperature, massFlow, specificHeat, power, running } = data;
  if (![inletTemperature, massFlow, specificHeat, power].every(Number.isFinite)
    || massFlow < 0 || specificHeat <= 0 || power < 0) {
    throw new RangeError("Heater inputs must be finite, with non-negative flow/power and positive specific heat.");
  }
  const duty = running && massFlow > 0 ? power : 0;
  const temperatureRise = duty === 0 ? 0 : duty / (massFlow * specificHeat);
  const outletTemperature = inletTemperature + temperatureRise;
  if (!Number.isFinite(outletTemperature)) throw new RangeError("Heater outlet temperature is outside the supported numeric range.");
  return { duty, temperatureRise, outletTemperature };
}
