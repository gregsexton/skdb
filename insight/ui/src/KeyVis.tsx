import * as d3 from "d3";
import { useEffect } from "react";

import data from "../../../gds/log/insight.json?raw";

export function KeyVisualisation() {
  useEffect(() => {
    createVis();
  });
  return (
    <svg id="key_vis" width="100%" height="100%">
      <g id="key_vis_group"></g>
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

interface SourceLink {
  source: number;
  target: number;
}

function srcId(src: Source) {
  return src.dir + "/" + src.key;
}

function getData(): Source {
  return JSON.parse(data);
}

function buildDataModel(src: Source) {
  const nodes: Source[] = [];
  const links: SourceLink[] = [];

  const nodeIdx = new Map();

  function walk(src: Source, target: number|undefined = undefined) {
    console.log(': [fbcfr] target: ', target);
    console.log(': [rrmcy] src: ', src);
    const id = srcId(src);

    let idx = nodeIdx.get(id);;

    if (idx === undefined) {
      idx = nodes.length;
      nodeIdx.set(id, idx);
      nodes.push(src);
    }

    if (target !== undefined) {
      const link = {source: idx, target: target};
      links.push(link);
    }

    for (const c of (src.contributions ?? [])) {
      // TODO: add data about contribution to edge
      if (!src.dir_is_input) {
        walk(c.source, idx);
      }
    }
  }

  walk(src);

  return [nodes, links];
}

function createVis() {
  const svg = d3.select("#key_vis");

  const width = parseInt(svg.style("width").replace("px", ""))
  const height = parseInt(svg.style("height").replace("px", ""));

  const [nodes, links] = buildDataModel(getData());

  function updateLinks() {
    svg
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#000000")
      .attr("x1", function (d) {
        return d.source.x;
      })
      .attr("y1", function (d) {
        return d.source.y;
      })
      .attr("x2", function (d) {
        return d.target.x;
      })
      .attr("y2", function (d) {
        return d.target.y;
      });
  }

  function updateNodes() {
    svg
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text(function (d) {
        return d.dir;
      })
      .attr("x", function (d) {
        return d.x;
      })
      .attr("y", function (d) {
        return d.y;
      })
      .attr("dx", function (d) {
        return 50;
      })
      .attr("dy", function (d) {
        return 50;
      });
  }

  function drawVis() {
    updateLinks();
    updateNodes();
  }

  d3.forceSimulation(nodes)
    .force("charge", d3.forceManyBody().strength(-800))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("link", d3.forceLink().links(links).distance(150))
    .on("tick", drawVis);
}
