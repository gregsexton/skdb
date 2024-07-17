import * as d3 from "d3";
import * as d3dag from "d3-dag";
import { useEffect } from "react";
import "./KeyVis.css";

import data from "../../../gds/log/insight.json?raw";

export function KeyVisualisation() {
  useEffect(() => {
    createVis();
  });
  return (
    <svg id="key_vis" width="100%" height="100%">
      <g id="links"></g>
      <g id="nodes"></g>
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

const getPosition = (function () {
  let lastKnownCursorPos: { x: number; y: number } | undefined = undefined;
  return (event) => {
    if (!event.clientX) {
      return lastKnownCursorPos;
    }

    lastKnownCursorPos = {
      x: event.clientX,
      y: event.clientY,
    };

    return lastKnownCursorPos;
  };
})();

function createVis() {
  const svg = d3.select("#key_vis");
  const dag = buildDataModel(getData());

  const [nodeW, nodeH] = [500, 200];
  const layout = d3dag.sugiyama().nodeSize([nodeW, nodeH]).gap([50, 50]);
  layout(dag);

  const defs = svg.append("defs");

  defs
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 5)
    .attr("refY", 0)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("class", "arrowHead");

  // TODO: center on the root node's x,y
  const line = d3.line().curve(d3.curveBumpY);

  function updateVis() {
    svg
      .select("#nodes")
      .selectAll("g")
      .data(dag.nodes())
      .join("g")
      .attr("transform", ({ x, y }) => `translate(${x + 5}, ${y + 5})`)
      .call((selection) => {
        const div = selection
          .append("foreignObject")
          .attr("width", nodeW)
          .attr("height", nodeH)
          .append("xhtml:div")
          .attr("class", "node");

        let origPos: { x: number; y: number } | undefined;

        div
          .append("div")
          .on("mousedown", (e, d) => {
            origPos = getPosition(e);
          })
          .on("mousemove", (e, d) => {
            if (origPos === undefined) {
              return;
            }
            const thisPos = getPosition(e);

            if (thisPos === undefined) {
              return;
            }
            d.ux = (d.ux ?? 0) - (origPos.x - thisPos.x);
            updateVis();
          })
          .on("mouseup", (e, d) => {
            if (origPos === undefined) {
              return;
            }
            const thisPos = getPosition(e);

            if (thisPos === undefined) {
              return;
            }
            d.ux = (d.ux ?? 0) - (origPos.x - thisPos.x);
            origPos = undefined;
            updateVis();
          })
          .append("pre")
          .attr("class", "dir")
          .append("code")
          .text((d) => d.data.dir);

        div
          .append("pre")
          .attr("class", "key")
          .append("code")
          .text((d) => d.data.key);
      });

    svg
      .select("#links")
      .selectAll("path")
      .data(dag.links())
      .join((enter) =>
        enter
          .append("path")
          .attr("d", ({ points }) => line(points))
          .attr("marker-end", "url(#arrow)"),
      );
  }

  updateVis();
}
