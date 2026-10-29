# Flow — process equipment for React Flow

A small library of animated, operable process equipment (for chemical plants and similar) built on [React Flow](https://reactflow.dev). Users drag equipment from a toolbox onto a canvas, connect nozzles with pipes, and operate each unit from its faceplate.

## Run

```sh
npm install
npm run dev
```

## Usage

```tsx
import { useState } from "react";
import "@xyflow/react/dist/style.css";
import { addEdge, Background, Controls, useEdgesState, useNodesState, type Connection } from "@xyflow/react";
import { PlantFlow, PlantToolbox, toPlantEdge, type PlantEdge, type PlantMode, type PlantNode } from "./plant";

function App() {
  const [nodes, , onNodesChange] = useNodesState<PlantNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PlantEdge>([]);
  const [mode, setMode] = useState<PlantMode>("select");
  const onConnect = (c: Connection) => setEdges(eds => addEdge(toPlantEdge(c), eds));

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <PlantToolbox mode={mode} onModeChange={setMode} />
      <div style={{ flex: 1 }}>
        <PlantFlow nodes={nodes} edges={edges} mode={mode}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}>
          <Background />
          <Controls />
        </PlantFlow>
      </div>
    </div>
  );
}
```

`PlantFlow` accepts every `ReactFlow` prop except `nodeTypes` and `edgeTypes`, which it supplies.

## Toolbox

- Floating, expandable panel over the canvas; equipment is grouped into sections and shown as a grid.
- Drag a tile onto the canvas to place it, or click it to place it in the centre of the view.
- New equipment gets the next free tag (`E-1`, `E-2`, …).
- **Select (V)**: drag to select, middle/right mouse to pan. **Pan (H)**: drag to pan, equipment locked.

## Equipment

### Heat exchanger (`heatExchanger`)

Shell-and-tube unit with a cutaway view. The cold stream runs through the tubes, the hot stream through the shell.

| Nozzle      | Port id    | Position                                         |
| ----------- | ---------- | ------------------------------------------------ |
| Cold inlet  | `cold-in`  | left head                                        |
| Cold outlet | `cold-out` | right head (1 pass) / left head (2 passes)       |
| Hot inlet   | `hot-in`   | top; right for counter-flow, left for parallel   |
| Hot outlet  | `hot-out`  | top, opposite the inlet                          |

Equipment stays compact on the canvas with a status chip, run switch, and a one-line summary (duty and both temperature changes). Select an exchanger or click its properties button to open the scrollable panel on the right. New equipment opens its properties automatically. The panel follows the selected exchanger, stays fixed while zooming/panning, and closes on deselection, its close button, or Escape while focus is inside it. It includes:

- **Process**: hot and cold inlet temperatures and flows; outlet temperatures. Connected inlet temperatures follow the upstream outlet. Flow and specific heat are read-only except at the unit that sets a closed loop’s circulation conditions.
- **Inlet pipe** (for each connected stream): upstream source, pipe conductance UA, ambient temperature and heat loss/gain.
- **Design**: tube count and length, tube passes (1 or 2), flow arrangement (counter or parallel, single pass only), baffle count (0–10) and baffle cut (15–45 %).
- **Performance**: duty, effectiveness, outside-area Uo, area, NTU, LMTD and correction factor FT.

The drawing follows the design: baffle count and cut, tube rows, the pass partition and return bend for two passes, and nozzle positions. Fluids are coloured by temperature (blue 0 °C → red 200 °C) and animate while running.

Thermal model (`equipment/HeatExchanger/model.ts`): single-phase ε-NTU rating with configurable stream heat capacities, tube dimensions, wall conductivity, film coefficients and separate fouling resistances. Counter and parallel flow apply to one tube pass; two passes use the one-shell/two-tube-pass relation. In the right properties panel, open **Design → Thermal properties** to edit the inputs. Existing nodes without these inputs use documented water/demo defaults.

Uo includes exact cylindrical wall conduction and converts the inner film/fouling resistances to outside tube area. Film coefficients are supplied for the operating conditions; changing flows, passes or baffles requires re-evaluating them. The former arbitrary baffle multiplier has been removed. The drawing still follows baffle count and cut. A helper implements the PDF's chart-based heat-transfer-factor equation; additional helpers provide tube velocity/Reynolds number and required heat-transfer area.

See [calculation equations, assumptions and PDF example corrections](docs/heat-exchanger-calculations.md). Condensation, boiling and pressure-drop design are outside this single-phase model.

Run the numerical regression tests with:

```sh
npm test
```

The tests compile the actual model with strict TypeScript checks and use Node's built-in test library, with no additional test dependencies. They run in one process to support environments that restrict child-process creation.

### Heater (`heater`)

Add **Heater** from **Heat transfer** in the toolbox, or drag it onto the canvas. Each heater gets an `H-` tag and has an inlet on the left (`hot-in`) and an outlet on the right (`hot-out`). Connect the right outlet to either inlet of an exchanger. Heaters can also receive an exchanger outlet or be connected in series.

Select the heater to edit inlet temperature, mass flow, specific heat and **Power kW**, then turn on its run switch. Power is the heat delivered to the fluid, with `Tout = Tin + power / (massFlow × Cp)`. Defaults are 25 °C, 1 kg/s, water Cp of 4.18 kJ/(kg K), 100 kW, and stopped. At these conditions, switching on gives an outlet of approximately 48.9 °C. The symbol, summary and properties show the calculated outlet and duty.

Connected heater inlets inherit upstream temperature, flow and Cp and expose the same pipe-loss controls as exchangers. Disconnecting restores the heater's manual inputs. Stopped heaters pass temperature through. At zero flow, duty is zero; heating of stagnant fluid is not modeled. This model assumes steady single-phase heating with constant Cp; it does not predict boiling, steam, thermal storage or electrical efficiency.

Heater calculation and integration tests run as part of `npm test`. See [heater calculations](docs/heater-calculations.md).

## Pipes

Connect an outlet to an inlet on another exchanger. You can drag in either direction; the pipe is normalized to outlet → inlet. Pipes take the stream colour of their source nozzle (`hot` or `cold`) and show moving dashes while either connected unit is running.

Series connections propagate upstream outlet temperature, mass flow and specific heat through the entire train, updating the symbols, process readings and duty immediately. Either stream can feed either downstream side. Disconnected inlets retain their saved manual settings. A stopped exchanger preserves the existing zero-duty/pass-through behavior; its run switch does not act as a shutoff valve.

Select the downstream exchanger to configure each inlet pipe. **Pipe UA W/K** is the total conductance to ambient (overall coefficient × heat-transfer area, including insulation). Its default of 0 means no heat loss. **Ambient °C** defaults to 25. Positive UA moves the fluid temperature toward ambient; the panel reports heat loss or gain in kW. Drawn pipe length has no physical meaning. This is a steady, single-phase thermal model, without pressure loss or transport delay.

One pipe per inlet/outlet is supported. Splits, mixing and self-connections are rejected. Closed circulation loops are supported: connect heater `hot-out` → exchanger `hot-in`, then exchanger `hot-out` → heater `hot-in`, in either order. Temperatures are solved simultaneously, including pipe losses. Turn on both units and provide flow on the exchanger's other side to remove the supplied heat.

In a closed loop, set mass flow and Cp at the heater (the lowest-ID heater if there are several). Without a heater, the lowest-ID equipment stream supplies these values. The properties panel identifies this unit; its flow/Cp controls stay editable while connected. An insulated passive loop has no unique absolute temperature, so saved inlet temperatures supply a reference. If heat input cannot be balanced—for example, the heater runs while the exchanger is stopped and both pipes are insulated—the connections remain, but temperature/duty readouts are marked unavailable with a calculation warning. Correct the operating conditions to resume calculation. No transient heat accumulation or pump hydraulics are simulated.

`resolvePlant(nodes, edges)` returns calculated data, performance and connected-inlet information in a map keyed by node ID. A nonempty `calculationError` means the numerical readouts are unavailable; callers must not use the reference values as a solved operating point. `PlantFlow` uses this derived state without overwriting the saved node data. Pipe settings live in `edge.data.thermalConductance` and `edge.data.ambientTemperature`.

## Theming

One set of design tokens (`--plant-*` custom properties) is shared by the canvas (`.plant`), the toolbox (`.plant-toolbox`) and its drag preview; override them to re-skin. React Flow's background and controls read from the same tokens.

- Dark theme: pass `colorMode="dark"` to `PlantFlow` and `className="dark"` to `PlantToolbox`.
- Fonts: Inter for UI, JetBrains Mono for numbers (loaded in `index.html`), with system fallbacks.
- Animations stop under `prefers-reduced-motion`.

## Adding equipment

Each piece of equipment lives in its own folder under `src/plant/equipment/`:

```
equipment/<Name>/
  <Name>.tsx    SVG symbol with Ports (ids start with `hot` or `cold`) + node wrapped in <Equipment>
  <Name>.css    symbol styles
  model.ts      calculations
  types.ts      node data and node type
  tool.tsx      toolbox entry
  index.ts      exports
```

Then wire it in:

1. `src/plant/types.ts`: add its node type to `PlantNode`.
2. `src/plant/registry.ts`: add its node component.
3. `src/plant/catalog.ts`: add its tool to `plantTools` (and a group to `plantToolGroups` if needed).

## Layout

```
src/
  App.tsx                      demo app: toolbox + empty canvas
  plant/
    index.ts                   public exports
    PlantFlow.tsx                canvas
    catalog.ts                 toolbox groups and entries
    registry.ts                node/edge types
    connections.ts             edge creation
    types.ts                   PlantNode, PlantEdge
    plant.css                    theme, faceplate, pipes, toolbox
    components/Equipment.tsx   symbol + collapsible faceplate, Port
    components/Faceplate.tsx   faceplate sections, inputs and readouts
    components/Toolbox.tsx
    edges/PipeEdge.tsx
    equipment/
      HeatExchanger/           HeatExchanger.tsx, HeatExchanger.css, model.ts, types.ts, tool.tsx, index.ts
```
