import { useCallback, useState } from "react";
import "@xyflow/react/dist/style.css";
import { addEdge, Background, BackgroundVariant, Controls, useEdgesState, useNodesState, type Connection } from "@xyflow/react";
import { PlantFlow, PlantToolbox, toPlantEdge, type PlantEdge, type PlantMode, type PlantNode } from "./plant";

const initialNodes: PlantNode[] = [];
const initialEdges: PlantEdge[] = [];

function App() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [mode, setMode] = useState<PlantMode>("select");

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(toPlantEdge(connection), eds)),
    [setEdges],
  );

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <PlantFlow
        nodes={nodes}
        edges={edges}
        mode={mode}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
        <Controls position="bottom-left" showInteractive={false} />
      </PlantFlow>
      <PlantToolbox mode={mode} onModeChange={setMode} />
    </div>
  );
}

export default App;
