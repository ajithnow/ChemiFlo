import { BaseEdge, getSmoothStepPath, useNodesData, type EdgeProps } from "@xyflow/react";
import type { PlantNode, PipeEdgeType } from "../types";

export const PipeEdge = ({ id, source, target, data, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }: EdgeProps<PipeEdgeType>) => {
  const ends = useNodesData<PlantNode>([source, target]);
  const flowing = ends.some(end => end.data.running);
  const stream = data?.stream ?? "cold";
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });

  return (
    <>
      <BaseEdge id={id} path={path} className={`plant-pipe plant-stream-${stream}`} />
      {flowing && <path d={path} className={`plant-flow plant-stream-${stream}`} />}
    </>
  );
};
