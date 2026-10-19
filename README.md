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

Equipment stays compact on the canvas with a status chip, run switch, and a one-line summary (duty and both temperature changes). Select an exchanger or click its properties button to open the scrollable panel on the right. New equipment opens its properties automatically. The panel follows the selected exchanger, stays fixed while zooming/panning, and closes on deselection, its close button, or Escape while focus is inside it. It has three sections:

- **Process**: hot and cold inlet temperatures and flows; outlet temperatures.
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

## Pipes

Pipes take the stream of the nozzle they leave from (`hot` or `cold`) and show moving dashes while either connected unit is running.

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
