import * as d3 from "d3";
import * as d3dag from "d3-dag";
import { useEffect } from "react";

import data from "../../../gds/log/insight.json?raw";

export function KeyVisualisation() {
  useEffect(() => {
    createVis();
  });
  return (
    <svg id="key_vis" width="100%" height="100%">
      <g id="nodes"></g>
      <g id="links"></g>
      <g id="arrows"></g>
    </svg>
  );
}

interface Contribution {
  tick: number;
  writer: string;
  files: string[];
  source: Source;
}

interface Source {
  dir: string;
  key: string;
  dir_is_input: boolean;
  contributions: Contribution[];
}

interface GraphNode {
  id: string;
  parentIds: string[];
}

function srcId(src: Source) {
  const sep = src.dir.endsWith("/") ? "" : "/";
  return src.dir + sep + src.key;
}

function getData(): Source {
  return JSON.parse(data);
}

function buildDataModel(src: Source) {
  const nodes: (Source & GraphNode)[] = [];

  const nodeIdx = new Map();

  function walk(src: Source) {
    const id = srcId(src);

    let idx = nodeIdx.get(id);

    if (idx === undefined) {
      idx = nodes.length;
      nodeIdx.set(id, idx);
      nodes.push({
        ...src,
        id,
        parentIds: src.dir_is_input
          ? []
          : src.contributions.map((c) => srcId(c.source)),
      });
    }

    for (const c of src.contributions ?? []) {
      // TODO: add data about contribution to edge
      if (!src.dir_is_input) {
        walk(c.source);
      }
    }
  }

  walk(src);

  return d3dag.graphStratify()(nodes);
}

function createVis() {
  const svg = d3.select("#key_vis");
  const dag = buildDataModel(getData());

  const nodesize = 5;
  const layout = d3dag
    .sugiyama()
    .nodeSize([nodesize, nodesize])
    .gap([400, 100]);
  layout(dag);

  svg
    .select("#nodes")
    .selectAll("g")
    .data(dag.nodes())
    .join((enter) =>
      enter
        .append("g")
        .attr("transform", ({ x, y }) => `translate(${x}, ${y})`)
        .attr("opacity", 1)
        .call((enter) => {
          // enter.append("circle").attr("r", nodesize);
          enter.append("text").text((d) => d.data.id);
        }),
    );

  const line = d3.line();
  svg
    .select("#links")
    .selectAll("path")
    .data(dag.links())
    .join((enter) =>
      enter
        .append("path")
        .attr("d", ({ points }) => line(points))
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke", "black"),
    );

  const arrowSize = 50;
  const arrow = d3.symbol().type(d3.symbolTriangle).size(arrowSize);
  function arrowTransform({
    points,
  }: {
    points: readonly (readonly [number, number])[];
  }): string {
    const [[x1, y1], [x2, y2]] = points.slice(-2);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90;
    return `translate(${x2}, ${y2}) rotate(${angle})`;
  }

  svg
    .select("#arrows")
    .selectAll("path")
    .data(dag.links())
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("d", arrow)
          .attr("fill", "black")
          .attr("transform", arrowTransform)
          .attr("stroke", "black")
          .attr("stroke-width", 1)
    );
}
