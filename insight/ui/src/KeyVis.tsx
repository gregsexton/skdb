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

function createVis() {
  const svg = d3.select("#key_vis");
  const dag = buildDataModel(getData());

  const [nodeW, nodeH] = [900, 600];
  const layout = d3dag.sugiyama().nodeSize([nodeW, nodeH]).gap([150, 100]);
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

  let tf = d3.zoomIdentity;

  const updateVis = () => {
    svg
      .select("#nodes")
      .selectAll("foreignObject")
      .data(dag.nodes(), (n) => n.data.id)
      .join(
        (enter) => {
          const div = enter
            .append("foreignObject")
            .attr("width", nodeW)
            .attr("height", nodeH)
            .append("xhtml:div")
            .attr("class", "node");

          const move = (e, d) => {
            d.x += e.dx / tf.k;
            d.y += e.dy / tf.k;
            // update position for any links
            for (const link of dag.links()) {
              link.points[0] = [link.source.x, link.source.y];
              link.points[1] = [link.target.x, link.target.y];
            }
          };

          div
            .on("mouseover", (e) => {
              if (div.nodes().includes(e.target)) {
                d3.select(e.target).style("cursor", "move");
              }
            })
            .on("mouseout", (e) => {
              if (div.nodes().includes(e.target)) {
                d3.select(e.target).style("cursor", "auto");
              }
            });

          div.call(
            d3
              .drag()
              .container(div)
              .filter(
                (e) =>
                  !e.ctrlKey && !e.button && div.nodes().includes(e.target),
              )
              .on("drag", move)
              .on("start.render drag.render end.render", updateVis),
          );

          div
            .append("div")
            .append("pre")
            .attr("class", "dir")
            .append("code")
            .text((d) => d.data.dir);

          div
            .append("pre")
            .attr("class", "key")
            .append("code")
            .text((d) => d.data.key);

          return div;
        },
        (update) => update,
        (exit) => exit.remove(),
      )
      .attr("x", ({ x }) => x)
      .attr("y", ({ y }) => y);

    svg
      .select("#links")
      .selectAll("path")
      .data(dag.links())
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("d", (link) => line(link.points))
            .attr("marker-end", "url(#arrow)"),
        (update) => update.attr("d", (link) => line(link.points)),
        (exit) => exit.remove(),
      );
  };

  const zoom = d3
    .zoom()
    .filter(
      (e) =>
        (!e.ctrlKey || e.type === "wheel") &&
        !e.button &&
        e.target === svg.node(),
    )
    .on("zoom", (e) => {
      tf = e.transform;
      svg.selectAll("g").attr("transform", e.transform);
    });

  svg.call(zoom);

  svg
    .on("mouseover", (e) => {
      if (svg.node() === e.target) {
        d3.select(e.target).style("cursor", "move");
      }
    })
    .on("mouseout", (e) => {
      if (svg.node() === e.target) {
        d3.select(e.target).style("cursor", "auto");
      }
    });

  updateVis();
  updateVis(); // TODO: why do I need to call this twice?! something is async perhaps?
}
