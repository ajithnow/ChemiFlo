import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useId } from "react";
import { Equipment, Port } from "../../components/Equipment";
import { FaceplateSection, Field, NumberInput, Readout, StreamLabel } from "../../components/Faceplate";
import { InletPipeProperties } from "../../components/InletPipeProperties";
import { useResolvedEquipment } from "../../simulationContext";
import type { PlantEdge, PlantNode } from "../../types";
import { temperatureColor } from "../HeatExchanger/model";
import { heaterPerformance } from "./model";
import type { HeaterData, HeaterNodeType } from "./types";
import "./Heater.css";

export interface HeaterSymbolProps {
  heating: boolean;
  inletTemperature?: number;
  outletTemperature?: number;
}

/** Inline electric heater; nozzle centres match the node's 240 × 110 symbol. */
export const HeaterSymbol = ({ heating, inletTemperature, outletTemperature }: HeaterSymbolProps) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const metalId = `heater-metal-${uid}`;
  return (
    <svg viewBox="0 0 240 110" width={240} height={110} className={`plant-heater${heating ? " is-heating" : ""}`} role="img" aria-label="Inline electric heater">
      <defs>
        <linearGradient id={metalId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--plant-metal-lo)" />
          <stop offset="0.3" stopColor="var(--plant-metal-hi)" />
          <stop offset="1" stopColor="var(--plant-metal-lo)" />
        </linearGradient>
      </defs>
      <path d="M67 83 L62 102 H82 L77 83 M163 83 L158 102 H178 L173 83" className="plant-heater-metal" />
      <path d="M0 50 H40 V60 H0 Z M200 50 H240 V60 H200 Z" fill={`url(#${metalId})`} className="plant-heater-edge" />
      <rect x="4" y="46" width="4" height="18" rx="1" fill={temperatureColor(inletTemperature ?? 25, 0, 200)} className="plant-heater-edge" />
      <rect x="232" y="46" width="4" height="18" rx="1" fill={temperatureColor(outletTemperature ?? 100, 0, 200)} className="plant-heater-edge" />
      <rect x="35" y="25" width="170" height="60" rx="20" fill={`url(#${metalId})`} className="plant-heater-edge" />
      <rect x="52" y="35" width="136" height="40" rx="10" className="plant-heater-window" />
      <path d="M57 55 H183" className="plant-heater-flow" />
      <path d="M68 55 H77 L84 42 L96 68 L108 42 L120 68 L132 42 L144 68 L156 42 L163 55 H172" className="plant-heater-coil" />
      <path d="M110 25 V14 H130 V25" className="plant-heater-metal" />
      <path d="M122 3 L116 10 H123 L118 18" className="plant-heater-power" />
      {inletTemperature !== undefined && <text x="2" y="80" className="plant-heater-tag">{Math.round(inletTemperature)}°</text>}
      {outletTemperature !== undefined && <text x="238" y="80" textAnchor="end" className="plant-heater-tag">{Math.round(outletTemperature)}°</text>}
    </svg>
  );
};

export const HeaterNode = ({ id, data: savedData, selected }: NodeProps<HeaterNodeType>) => {
  const equipment = useResolvedEquipment(id);
  const resolved = equipment?.type === "heater" ? equipment : undefined;
  const data = resolved?.data ?? savedData;
  const calculationError = resolved?.calculationError;
  const performance = resolved?.performance ?? heaterPerformance(data);
  const { updateNodeData, setNodes } = useReactFlow<PlantNode, PlantEdge>();
  return (
    <Equipment
      tag={data.label}
      running={data.running}
      onToggleRunning={() => updateNodeData(id, { running: !data.running })}
      propertiesOpen={selected}
      onOpenProperties={() => setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id })))}
      summary={calculationError ? <span>Temperature unavailable</span> : <>
        <span className="plant-summary-duty">{Math.round(performance.duty)} kW</span>
        <StreamLabel stream="hot">{Math.round(data.inletTemperature)}° → {Math.round(performance.outletTemperature)}°</StreamLabel>
      </>}
      symbol={<>
        <HeaterSymbol heating={!calculationError && performance.duty > 0} inletTemperature={calculationError ? undefined : data.inletTemperature} outletTemperature={calculationError ? undefined : performance.outletTemperature} />
        <Port id="hot-in" position={Position.Left} offset={50} />
        <Port id="hot-out" position={Position.Right} offset={50} />
      </>}
    />
  );
};

export const HeaterProperties = ({ id, data: savedData }: { id: string; data: HeaterData }) => {
  const equipment = useResolvedEquipment(id);
  const resolved = equipment?.type === "heater" ? equipment : undefined;
  const data = resolved?.data ?? savedData;
  const calculationError = resolved?.calculationError;
  const performance = resolved?.performance ?? heaterPerformance(data);
  const inlet = resolved?.inlets.hot;
  const { updateNodeData } = useReactFlow<PlantNode, PlantEdge>();
  const update = (patch: Partial<HeaterData>) => updateNodeData(id, patch);
  return (
    <>
      <FaceplateSection title="Process">
        <div className="plant-fp-row">
          <Field label="Inlet °C">
            {calculationError && inlet ? <output>—</output> : <NumberInput label="Heater inlet temperature" value={data.inletTemperature} readOnly={Boolean(inlet)} step={0.1} onChange={inletTemperature => update({ inletTemperature })} />}
          </Field>
          <Field label="Flow kg/s">
            <NumberInput label="Heater mass flow" value={data.massFlow} readOnly={Boolean(inlet) && !inlet?.controlsFlow} min={0} step={0.1} onChange={massFlow => update({ massFlow })} />
          </Field>
        </div>
        <Field label="Cp kJ/kg K">
          <NumberInput label="Heater specific heat" value={data.specificHeat} readOnly={Boolean(inlet) && !inlet?.controlsFlow} min={0.001} step={0.01} onChange={specificHeat => update({ specificHeat })} />
        </Field>
      </FaceplateSection>
      {inlet && <InletPipeProperties inlet={inlet} stream="hot" title="Inlet pipe" />}
      <FaceplateSection title="Heating">
        <Field label="Power kW">
          <NumberInput label="Heater power" value={data.power} min={0} step={10} onChange={power => update({ power })} />
        </Field>
        <p className="plant-process-note">Power delivered to the fluid. Switch on the heater to apply heat. Single-phase heating; boiling and steam are not modeled.</p>
      </FaceplateSection>
      <FaceplateSection title="Performance">
        {calculationError ? <p className="plant-process-note">No steady-state temperature. Review the loop heat balance.</p> : <div className="plant-fp-readouts">
          <Readout label="Outlet" value={performance.outletTemperature.toFixed(1)} unit="°C" primary />
          <Readout label="Duty" value={performance.duty.toFixed(1)} unit="kW" />
          <Readout label="Temperature rise" value={performance.temperatureRise.toFixed(1)} unit="K" />
        </div>}
        {data.massFlow === 0 && <p className="plant-process-note" role="status">No flow. Delivered duty is zero; stagnant-fluid heating is not modeled.</p>}
      </FaceplateSection>
    </>
  );
};
