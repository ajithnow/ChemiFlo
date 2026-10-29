import { useReactFlow } from "@xyflow/react";
import { FaceplateSection, Field, NumberInput, Readout } from "./Faceplate";
import type { ConnectedInlet } from "../network";
import type { PlantEdge, PlantNode, Stream } from "../types";

export const InletPipeProperties = ({ inlet, stream, title }: { inlet: ConnectedInlet; stream: Stream; title?: string }) => {
  const { updateEdgeData } = useReactFlow<PlantNode, PlantEdge>();
  return (
    <FaceplateSection title={title ?? `${stream === "hot" ? "Hot" : "Cold"} inlet pipe`}>
      <p className="plant-process-note">From {inlet.sourceLabel} {inlet.sourceStream} outlet. {inlet.loop
        ? `Closed circulation loop. Set flow and Cp at ${inlet.flowSourceLabel}; temperature is calculated around the loop.`
        : "Temperature, flow and Cp follow the upstream stream."}</p>
      <div className="plant-fp-row">
        <Field label="Pipe UA W/K">
          <NumberInput label={`${stream} pipe thermal conductance`} value={inlet.edge.data?.thermalConductance ?? 0} min={0} step={10}
            onChange={thermalConductance => updateEdgeData(inlet.edge.id, { thermalConductance })} />
        </Field>
        <Field label="Ambient °C">
          <NumberInput label={`${stream} pipe ambient temperature`} value={inlet.edge.data?.ambientTemperature ?? 25}
            onChange={ambientTemperature => updateEdgeData(inlet.edge.id, { ambientTemperature })} />
        </Field>
      </div>
      <p className="plant-process-note">UA = overall heat-transfer coefficient × pipe area. Use 0 for no heat loss. Canvas pipe length does not set UA.</p>
      <Readout label={inlet.heatLoss < 0 ? "Pipe heat gain" : "Pipe heat loss"} value={inlet.calculationError ? "—" : Math.abs(inlet.heatLoss).toFixed(2)} unit="kW" />
    </FaceplateSection>
  );
};
