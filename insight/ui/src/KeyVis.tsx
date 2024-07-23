import * as d3dag from "d3-dag";
import { useLayoutEffect, useRef } from "react";
import "./KeyVis.css";

import data from "../../../gds/log/insight.json?raw";
import { createDagVis } from "./dag";

export function KeyVisualisation() {
  const svgRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const dag = buildDataModel(getData());
    createKeyVis(svgRef.current!!, dag);
  });
  return <svg width="100%" height="100%" ref={svgRef}></svg>;
}

// TODO: make this a tagged object and include more data
type File = string | (string | number)[];
type Key = File;

interface Contribution {
  tick: number;
  writer: string;
  files: File[];
  source?: Source;
}

interface Source {
  dir: string;
  key: Key;
  dir_is_input: boolean;
  contributions: Contribution[];
  id: string;
  parentIds: string[];
}

function pprint(k: Key) {
  if (typeof k === "string") {
    return k;
  }
  return JSON.stringify(k);
}

function srcId(src: Source) {
  const sep = src.dir.endsWith("/") ? "" : "/";
  return src.dir + sep + JSON.stringify(src.key);
}

function getData(): Source {
  return JSON.parse(data);
}

function buildDataModel(src: Source): d3dag.Graph<Source, undefined> {
  const nodes: Source[] = [];

  const nodeIdx = new Map();

  function walk(src: Source) {
    const id = srcId(src);

    let idx = nodeIdx.get(id);

    if (idx === undefined) {
      idx = nodes.length;
      nodeIdx.set(id, idx);
      src.id = id;
      src.parentIds = src.dir_is_input
        ? []
        : src.contributions.map((c) => srcId(c.source!));
      nodes.push(src);
    }

    for (const c of src.contributions ?? []) {
      if (!src.dir_is_input) {
        walk(c.source!);
      }
    }
  }

  walk(src);

  return d3dag.graphStratify()(nodes);
}

function createKeyVis(
  svgElem: SVGSVGElement,
  dag: d3dag.Graph<Source, undefined>,
) {
  const highlightedSourceIds = new Set<String>();

  const updateVis = createDagVis<Source, undefined>(
    svgElem,
    dag,
    // node enter
    (div) => {
      div.classed("highlighted", (d) => highlightedSourceIds.has(d.data.id));
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
        .text((d) => pprint(d.data.key));

      div
        .append("div")
        .selectAll("div")
        .data((d) => d.data.contributions)
        .join((enter) => {
          const div = enter.append("div").attr("class", "contributions");

          div.on("mouseout", () => {
            highlightedSourceIds.clear();
            updateVis();
          });
          div.on("mouseover", (_e, d) => {
            if (d.source) {
              highlightedSourceIds.add(d.source.id);
              updateVis();
            }
          });

          div
            .append("div")
            .selectAll("pre")
            .data((d) => d.files)
            .join((enter) => {
              return enter.append("pre").attr("class", "file").append("code");
            })
            .text((d) => pprint(d));

          div
            .append("pre")
            .attr("class", "tick")
            .append("code")
            .text((d) => "Tick: " + d.tick);

          // div.append("p").text((d) => d.writer);

          return div;
        });
    },
    // node update
    (div) => {
      div.classed("highlighted", (d) => highlightedSourceIds.has(d.data.id));
    },
    // link enter
    (d) => {
      d.attr("marker-end", (d) =>
        highlightedSourceIds.has(d.source.data.id)
          ? "url(#arrow-highlighted)"
          : "url(#arrow)",
      );
    },
    // link update
    (d) => {
      d.attr("marker-end", (d) =>
        highlightedSourceIds.has(d.source.data.id)
          ? "url(#arrow-highlighted)"
          : "url(#arrow)",
      ).classed("highlighted", (d) =>
        highlightedSourceIds.has(d.source.data.id),
      );
    },
  );
}
