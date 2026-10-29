import { Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { useEffect, useId } from "react";
import { Equipment, Port } from "../../components/Equipment";
import { FaceplateSection, Field, NumberInput, RangeInput, Readout, Segmented, StreamLabel } from "../../components/Faceplate";
import { InletPipeProperties } from "../../components/InletPipeProperties";
import { useResolvedEquipment } from "../../simulationContext";
import type { PlantEdge, PlantNode } from "../../types";
import { defaultHeatExchangerDesign, heatExchangerPerformance, temperatureColor, thermalProperties } from "./model";
import type { HeatExchangerData, HeatExchangerDesign, HeatExchangerNodeType, HeatExchangerThermalProperties } from "./types";
import "./HeatExchanger.css";

export interface HeatExchangerTemperatures {
  hotIn: number;
  hotOut: number;
  coldIn: number;
  coldOut: number;
}

export interface HeatExchangerSymbolProps {
  running: boolean;
  design?: HeatExchangerDesign;
  temperatures?: HeatExchangerTemperatures;
}

// Geometry (viewBox 240 × 110). Ports in HeatExchangerNode are placed from the same layout.
const W = 240;
const H = 110;
const WIN_TOP = 38;
const WIN_BOTTOM = 78;
const WIN_LEFT = 52;
const WIN_RIGHT = 188;
const MID_Y = (WIN_TOP + WIN_BOTTOM) / 2;

interface Nozzle {
  side: "left" | "right";
  y: number;
}

function layout({ tubes, tubePasses, arrangement, baffles, baffleCut }: HeatExchangerDesign) {
  const counter = tubePasses === 2 || arrangement === "counter";
  let rows = Math.min(6, Math.max(2, Math.round(tubes / 40)));
  if (tubePasses === 2 && rows % 2) rows = Math.min(6, rows + 1);

  const hotInX = counter ? 170 : 70;
  const hotOutX = counter ? 70 : 170;
  const tubeYs = Array.from({ length: rows }, (_, i) => WIN_TOP + ((i + 1) * (WIN_BOTTOM - WIN_TOP)) / (rows + 1));

  const cutHeight = ((WIN_BOTTOM - WIN_TOP) * baffleCut) / 100;
  const baffleList = Array.from({ length: baffles }, (_, i) => {
    const x = 70 + ((i + 1) * 100) / (baffles + 1);
    const fromTop = i % 2 === 0;
    return {
      x,
      y: fromTop ? WIN_TOP : WIN_TOP + cutHeight,
      height: WIN_BOTTOM - WIN_TOP - cutHeight,
      gapY: fromTop ? WIN_BOTTOM - cutHeight / 2 : WIN_TOP + cutHeight / 2,
    };
  });
  const ordered = counter ? [...baffleList].reverse() : baffleList;
  const shellPath = [
    [hotInX, WIN_TOP],
    ...(baffles ? ordered.map(b => [b.x, b.gapY]) : [[120, MID_Y]]),
    [hotOutX, WIN_TOP],
  ];

  const coldIn: Nozzle = tubePasses === 1 ? { side: "left", y: 58 } : { side: "left", y: 72 };
  const coldOut: Nozzle = tubePasses === 1 ? { side: "right", y: 58 } : { side: "left", y: 44 };

  return { hotInX, hotOutX, tubeYs, baffleList, shellPath, coldIn, coldOut };
}

const fmt = (celsius: number) => `${Math.round(celsius)}°`;

const ColdNozzle = ({ nozzle, color, pipeFill }: { nozzle: Nozzle; color: string; pipeFill: string }) => {
  const left = nozzle.side === "left";
  return (
    <>
      <rect x={left ? 0 : W - 22} y={nozzle.y - 5} width="22" height="10" rx="2" fill={pipeFill} className="plant-hx-edge" />
      <rect x={left ? 4 : W - 8} y={nozzle.y - 9} width="4" height="18" rx="1" style={{ fill: color }} className="plant-hx-edge" />
    </>
  );
};

const HotNozzle = ({ x, color, pipeFill }: { x: number; color: string; pipeFill: string }) => (
  <>
    <rect x={x - 5} y="0" width="10" height="32" rx="2" fill={pipeFill} className="plant-hx-edge" />
    <rect x={x - 9} y="4" width="18" height="4" rx="1" style={{ fill: color }} className="plant-hx-edge" />
  </>
);

/** Shell-and-tube exchanger with a cutaway; baffles, tube rows, passes and nozzles follow the design. */
export const HeatExchangerSymbol = ({ running, design = defaultHeatExchangerDesign, temperatures: t }: HeatExchangerSymbolProps) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `hx-${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const { hotInX, hotOutX, tubeYs, baffleList, shellPath, coldIn, coldOut } = layout(design);
  const twoPass = design.tubePasses === 2;

  // Colours are scaled to this unit's own range, so the hot inlet is always red and the cold inlet blue.
  const coldest = t ? Math.min(t.coldIn, t.hotIn) : 0;
  const hottest = t ? Math.max(t.coldIn, t.hotIn) : 1;
  const color = (celsius: number) => temperatureColor(celsius, coldest, hottest);
  const hot = t ? [color(t.hotIn), color(t.hotOut)] : [color(1), color(0.45)];
  const cold = t ? [color(t.coldIn), color(t.coldOut)] : [color(0), color(0.4)];
  const coldMid = t ? color((t.coldIn + t.coldOut) / 2) : color(0.2);

  // Two passes: the lower rows run left -> right first, then return through the upper rows.
  const tubes = tubeYs.map(y => {
    const returning = twoPass && y < MID_Y;
    return { y, returning, gradient: !twoPass ? "tubes" : returning ? "tubes-2" : "tubes-1" };
  });

  const metalStops = (mid: number) => (
    <>
      <stop offset="0" style={{ stopColor: "var(--plant-metal-lo)" }} />
      <stop offset={mid} style={{ stopColor: "var(--plant-metal-hi)" }} />
      <stop offset="1" style={{ stopColor: "var(--plant-metal-lo)" }} />
    </>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={`plant-hx${running ? " is-running" : ""}`}>
      <defs>
        <linearGradient id={id("metal")} x1="0" y1="0" x2="0" y2="1">{metalStops(0.3)}</linearGradient>
        <linearGradient id={id("pipe")} x1="0" y1="0" x2="0" y2="1">{metalStops(0.4)}</linearGradient>
        <linearGradient id={id("pipe-v")} x1="0" y1="0" x2="1" y2="0">{metalStops(0.4)}</linearGradient>
        <linearGradient id={id("tubes")} x1={WIN_LEFT} y1="0" x2={WIN_RIGHT} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: cold[0] }} />
          <stop offset="1" style={{ stopColor: cold[1] }} />
        </linearGradient>
        <linearGradient id={id("tubes-1")} x1={WIN_LEFT} y1="0" x2={WIN_RIGHT} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: cold[0] }} />
          <stop offset="1" style={{ stopColor: coldMid }} />
        </linearGradient>
        <linearGradient id={id("tubes-2")} x1={WIN_RIGHT} y1="0" x2={WIN_LEFT} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: coldMid }} />
          <stop offset="1" style={{ stopColor: cold[1] }} />
        </linearGradient>
        <linearGradient id={id("shell-side")} x1={hotInX} y1="0" x2={hotOutX} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: hot[0] }} />
          <stop offset="1" style={{ stopColor: hot[1] }} />
        </linearGradient>
        <linearGradient id={id("thermal")} x1={hotInX} y1="0" x2={hotOutX} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: hot[0] }} />
          <stop offset="1" style={{ stopColor: hot[1] }} />
        </linearGradient>
        <clipPath id={id("window")}>
          <rect x={WIN_LEFT} y={WIN_TOP} width={WIN_RIGHT - WIN_LEFT} height={WIN_BOTTOM - WIN_TOP} rx="6" />
        </clipPath>
      </defs>

      <path d="M62 84 L57 104 H83 L78 84 Z" className="plant-hx-steel" />
      <path d="M162 84 L157 104 H183 L178 84 Z" className="plant-hx-steel" />

      <ColdNozzle nozzle={coldIn} color={cold[0]} pipeFill={url("pipe")} />
      <ColdNozzle nozzle={coldOut} color={cold[1]} pipeFill={url("pipe")} />
      <HotNozzle x={hotInX} color={hot[0]} pipeFill={url("pipe-v")} />
      <HotNozzle x={hotOutX} color={hot[1]} pipeFill={url("pipe-v")} />

      <path d="M40 30 H34 A16 28 0 0 0 34 86 H40 Z" fill={url("metal")} className="plant-hx-edge" />
      <path d="M200 30 H206 A16 28 0 0 1 206 86 H200 Z" fill={url("metal")} className="plant-hx-edge" />
      <rect x="40" y="30" width="160" height="56" rx="3" fill={url("metal")} className="plant-hx-edge" />
      <path d="M40 30 H34 A16 28 0 0 0 34 86 H40 Z" style={{ fill: cold[0] }} className="plant-hx-thermal" />
      <path d="M200 30 H206 A16 28 0 0 1 206 86 H200 Z" style={{ fill: twoPass ? coldMid : cold[1] }} className="plant-hx-thermal" />
      <rect x="40" y="30" width="160" height="56" rx="3" fill={url("thermal")} className="plant-hx-thermal" />
      <rect x="38" y="27" width="5" height="62" rx="1" className="plant-hx-steel" />
      <rect x="197" y="27" width="5" height="62" rx="1" className="plant-hx-steel" />

      {twoPass && (
        <>
          <line x1="19" y1={MID_Y} x2="40" y2={MID_Y} className="plant-hx-partition" />
          <path
            d={`M200 ${tubeYs[tubeYs.length - 1]} C 216 ${tubeYs[tubeYs.length - 1]} 216 ${tubeYs[0]} 200 ${tubeYs[0]}`}
            style={{ stroke: coldMid }}
            className="plant-hx-return"
          />
        </>
      )}

      <rect x={WIN_LEFT} y={WIN_TOP} width={WIN_RIGHT - WIN_LEFT} height={WIN_BOTTOM - WIN_TOP} rx="6" className="plant-hx-interior" />
      <g clipPath={url("window")}>
        <rect x={WIN_LEFT} y={WIN_TOP} width={WIN_RIGHT - WIN_LEFT} height={WIN_BOTTOM - WIN_TOP} fill={url("shell-side")} className="plant-hx-shell-fluid" />
        <polyline points={shellPath.map(p => p.join(",")).join(" ")} stroke={url("shell-side")} className="plant-hx-shell-flow" />
        {baffleList.map(b => (
          <rect key={b.x} x={b.x - 1.5} y={b.y} width="3" height={b.height} className="plant-hx-baffle" />
        ))}
        {tubes.map(tube => (
          <line key={tube.y} x1={WIN_LEFT} y1={tube.y} x2={WIN_RIGHT} y2={tube.y} stroke={url(tube.gradient)} className="plant-hx-tube" />
        ))}
        {running &&
          tubes.map(tube => (
            <line
              key={tube.y}
              x1={tube.returning ? WIN_RIGHT : WIN_LEFT}
              y1={tube.y}
              x2={tube.returning ? WIN_LEFT : WIN_RIGHT}
              y2={tube.y}
              className="plant-hx-particles"
            />
          ))}
      </g>
      <rect x={WIN_LEFT} y={WIN_TOP} width={WIN_RIGHT - WIN_LEFT} height={WIN_BOTTOM - WIN_TOP} rx="6" className="plant-hx-window" />

      {t && (
        <g className="plant-hx-tags">
          {[
            { nozzle: coldIn, value: t.coldIn },
            { nozzle: coldOut, value: t.coldOut },
          ].map(({ nozzle, value }) => (
            <text
              key={nozzle.y + nozzle.side}
              x={nozzle.side === "left" ? 2 : W - 2}
              y={nozzle.y < MID_Y ? nozzle.y - 12 : nozzle.y + 20}
              textAnchor={nozzle.side === "left" ? "start" : "end"}
            >
              {fmt(value)}
            </text>
          ))}
          <text x={hotInX + 12} y="18">{fmt(t.hotIn)}</text>
          <text x={hotOutX + 12} y="18">{fmt(t.hotOut)}</text>
        </g>
      )}
    </svg>
  );
};

const nozzlePosition = (nozzle: Nozzle) => (nozzle.side === "left" ? Position.Left : Position.Right);

export const HeatExchangerNode = ({ id, data: savedData, selected }: NodeProps<HeatExchangerNodeType>) => {
  const equipment = useResolvedEquipment(id);
  const resolved = equipment?.type === "heatExchanger" ? equipment : undefined;
  const data = resolved?.data ?? savedData;
  const calculationError = resolved?.calculationError;
  const { updateNodeData, setNodes } = useReactFlow<PlantNode, PlantEdge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const update = (patch: Partial<HeatExchangerData>) => updateNodeData(id, patch);
  const performance = resolved?.performance ?? heatExchangerPerformance(data);
  const { hotInX, hotOutX, coldIn, coldOut } = layout(data);

  // Nozzles move when passes or arrangement change; React Flow must re-measure the ports.
  useEffect(() => updateNodeInternals(id), [id, data.tubePasses, data.arrangement, updateNodeInternals]);

  return (
    <Equipment
      tag={data.label}
      running={data.running}
      onToggleRunning={() => update({ running: !data.running })}
      propertiesOpen={selected}
      onOpenProperties={() => setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id })))}
      summary={calculationError ? <span>Temperature unavailable</span> :
        <>
          <span className="plant-summary-duty">{Math.round(performance.duty)} kW</span>
          <StreamLabel stream="hot">{fmt(data.hotIn)} → {fmt(performance.hotOut)}</StreamLabel>
          <StreamLabel stream="cold">{fmt(data.coldIn)} → {fmt(performance.coldOut)}</StreamLabel>
        </>
      }
      symbol={
        <>
          <HeatExchangerSymbol
            running={data.running}
            design={data}
            temperatures={calculationError ? undefined : { hotIn: data.hotIn, hotOut: performance.hotOut, coldIn: data.coldIn, coldOut: performance.coldOut }}
          />
          <Port id="cold-in" position={nozzlePosition(coldIn)} offset={(coldIn.y / H) * 100} />
          <Port id="cold-out" position={nozzlePosition(coldOut)} offset={(coldOut.y / H) * 100} />
          <Port id="hot-in" position={Position.Top} offset={(hotInX / W) * 100} />
          <Port id="hot-out" position={Position.Top} offset={(hotOutX / W) * 100} />
        </>
      }
    />
  );
};

/** Editable fields live outside the node so opening them never changes its size. */
export const HeatExchangerProperties = ({ id, data: savedData }: { id: string; data: HeatExchangerData }) => {
  const equipment = useResolvedEquipment(id);
  const resolved = equipment?.type === "heatExchanger" ? equipment : undefined;
  const data = resolved?.data ?? savedData;
  const calculationError = resolved?.calculationError;
  const inlets = resolved?.inlets ?? {};
  const { updateNodeData } = useReactFlow<PlantNode, PlantEdge>();
  const update = (patch: Partial<HeatExchangerData>) => updateNodeData(id, patch);
  const performance = resolved?.performance ?? heatExchangerPerformance(data);
  const thermal = thermalProperties(data);
  const updateThermal = (patch: Partial<HeatExchangerThermalProperties>) => update({ thermal: { ...savedData.thermal, ...patch } });

  return (
    <>
      <FaceplateSection title="Process">
        <table className="plant-readings">
          <thead>
            <tr>
              <th />
              <th>In °C</th>
              <th>Flow kg/s</th>
              <th>Out °C</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th><StreamLabel stream="hot">Hot</StreamLabel></th>
              <td>{calculationError && inlets.hot ? <output>—</output> : <NumberInput label="Hot inlet temperature" readOnly={Boolean(inlets.hot)} value={data.hotIn} onChange={hotIn => update({ hotIn })} />}</td>
              <td><NumberInput label="Hot flow" readOnly={Boolean(inlets.hot) && !inlets.hot?.controlsFlow} value={data.hotFlow} min={0} step={0.5} onChange={hotFlow => update({ hotFlow })} /></td>
              <td><output>{calculationError ? "—" : performance.hotOut.toFixed(1)}</output></td>
            </tr>
            <tr>
              <th><StreamLabel stream="cold">Cold</StreamLabel></th>
              <td>{calculationError && inlets.cold ? <output>—</output> : <NumberInput label="Cold inlet temperature" readOnly={Boolean(inlets.cold)} value={data.coldIn} onChange={coldIn => update({ coldIn })} />}</td>
              <td><NumberInput label="Cold flow" readOnly={Boolean(inlets.cold) && !inlets.cold?.controlsFlow} value={data.coldFlow} min={0} step={0.5} onChange={coldFlow => update({ coldFlow })} /></td>
              <td><output>{calculationError ? "—" : performance.coldOut.toFixed(1)}</output></td>
            </tr>
          </tbody>
        </table>
      </FaceplateSection>

      {(["hot", "cold"] as const).map(stream => {
        const inlet = inlets[stream];
        if (!inlet) return null;
        return <InletPipeProperties key={stream} inlet={inlet} stream={stream} />;
      })}

      <FaceplateSection title="Design">
        <div className="plant-fp-row">
          <Field label="Tubes">
            <NumberInput label="Tube count" value={data.tubes} min={10} max={1000} step={10} onChange={tubes => update({ tubes: Math.round(tubes) })} />
          </Field>
          <Field label="Length m">
            <NumberInput label="Tube length" value={data.tubeLength} min={1} max={12} step={0.5} onChange={tubeLength => update({ tubeLength })} />
          </Field>
        </div>
        <div className="plant-fp-row">
          <Field label="Passes">
            <Segmented
              label="Tube passes"
              value={data.tubePasses}
              options={[{ value: 1, label: "1" }, { value: 2, label: "2" }]}
              onChange={tubePasses => update({ tubePasses })}
            />
          </Field>
          <Field label="Flow">
            <Segmented
              label="Flow arrangement"
              value={data.tubePasses === 2 ? "counter" : data.arrangement}
              options={[{ value: "counter", label: "Counter" }, { value: "parallel", label: "Parallel" }]}
              onChange={arrangement => update({ arrangement })}
              disabled={data.tubePasses === 2}
            />
          </Field>
        </div>
        <RangeInput label="Baffles" value={data.baffles} min={0} max={10} display={String(data.baffles)} onChange={baffles => update({ baffles })} />
        <RangeInput label="Baffle cut" value={data.baffleCut} min={15} max={45} step={5} display={`${data.baffleCut}%`} onChange={baffleCut => update({ baffleCut })} />
        <details className="plant-hx-properties">
          <summary>Thermal properties</summary>
          <p>Single-phase fluids. Enter properties at mean fluid temperatures. Re-evaluate film coefficients when flows, passes or baffles change.</p>
          <div className="plant-fp-row">
            <Field label="Hot Cp kJ/kg K"><NumberInput label="Hot specific heat" readOnly={Boolean(inlets.hot) && !inlets.hot?.controlsFlow} value={thermal.hotSpecificHeat} min={0.001} step={0.01} onChange={hotSpecificHeat => updateThermal({ hotSpecificHeat })} /></Field>
            <Field label="Cold Cp kJ/kg K"><NumberInput label="Cold specific heat" readOnly={Boolean(inlets.cold) && !inlets.cold?.controlsFlow} value={thermal.coldSpecificHeat} min={0.001} step={0.01} onChange={coldSpecificHeat => updateThermal({ coldSpecificHeat })} /></Field>
          </div>
          <div className="plant-fp-row">
            <Field label="Tube OD mm"><NumberInput label="Tube outer diameter" value={thermal.tubeOuterDiameter * 1000} min={thermal.tubeInnerDiameter * 1000 + 0.1} step={0.1} onChange={value => updateThermal({ tubeOuterDiameter: value / 1000 })} /></Field>
            <Field label="Tube ID mm"><NumberInput label="Tube inner diameter" value={thermal.tubeInnerDiameter * 1000} min={0.1} max={thermal.tubeOuterDiameter * 1000 - 0.1} step={0.1} onChange={value => updateThermal({ tubeInnerDiameter: value / 1000 })} /></Field>
          </div>
          <div className="plant-fp-row">
            <Field label="Wall k W/m K"><NumberInput label="Tube wall conductivity" value={thermal.wallConductivity} min={0.01} step={1} onChange={wallConductivity => updateThermal({ wallConductivity })} /></Field>
          </div>
          <div className="plant-fp-row">
            <Field label="Shell h W/m²K"><NumberInput label="Shell film coefficient" value={thermal.shellFilmCoefficient} min={0.1} step={10} onChange={shellFilmCoefficient => updateThermal({ shellFilmCoefficient })} /></Field>
            <Field label="Tube h W/m²K"><NumberInput label="Tube film coefficient" value={thermal.tubeFilmCoefficient} min={0.1} step={10} onChange={tubeFilmCoefficient => updateThermal({ tubeFilmCoefficient })} /></Field>
          </div>
          <div className="plant-fp-row">
            <Field label="Shell Rf m²K/W"><NumberInput label="Shell fouling resistance" value={thermal.shellFoulingResistance} min={0} step={0.0001} onChange={shellFoulingResistance => updateThermal({ shellFoulingResistance })} /></Field>
            <Field label="Tube Rf m²K/W"><NumberInput label="Tube fouling resistance" value={thermal.tubeFoulingResistance} min={0} step={0.0001} onChange={tubeFoulingResistance => updateThermal({ tubeFoulingResistance })} /></Field>
          </div>
        </details>
      </FaceplateSection>

      <FaceplateSection title="Performance">
        {calculationError ? <p className="plant-hx-note">No steady-state temperature. Review the loop heat balance.</p> : <div className="plant-fp-readouts">
          <Readout label="Duty" value={Math.round(performance.duty).toString()} unit="kW" primary />
          <Readout label="Effectiveness" value={performance.effectiveness.toFixed(2)} />
          <Readout label="Uo" value={Math.round(performance.u).toString()} unit="W/m²K" title="Overall coefficient on outside tube area, including wall and both fouling resistances" />
          <Readout label="Area" value={performance.area.toFixed(1)} unit="m²" />
          <Readout label="NTU" value={performance.ntu.toFixed(2)} />
          <Readout label="LMTD" value={performance.lmtd?.toFixed(1) ?? "—"} unit="K" />
          <Readout label="FT" value={performance.correctionFactor?.toFixed(3) ?? "—"} title="LMTD correction factor; single-pass uses its own flow arrangement's LMTD" />
        </div>}
        {!calculationError && performance.correctionFactor !== null && performance.correctionFactor < 0.75 && (
          <p className="plant-hx-note" role="status">FT is below 0.75. Review the exchanger arrangement and operating conditions.</p>
        )}
      </FaceplateSection>
    </>
  );
};
