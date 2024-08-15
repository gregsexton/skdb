import * as d3dag from "d3-dag";
import { useLayoutEffect, useRef, useState } from "react";
import "./KeyVis.css";

import data from "../../../gds/log/insight.json?raw";
import { createDagVis } from "./dag";

// TODO: make this a tagged object and include more data
type File = string | (string | number)[];
type Key = File;

interface Contribution {
  tick: number;
  writer: string;
  files: File[];
  source?: Source;
  mapfns: string[];
}

interface Source {
  dir: string;
  key: Key;
  dir_is_input: boolean;
  contributions: Contribution[];
}

interface DirNode {
  dir: string;
  keys: Source[];
  id: string;
  parentIds: string[];
}

interface Vis {
  update: () => void;
  clearViewing: () => void;
}

function ContributionDetail({
  contribution,
  dismiss,
}: {
  contribution?: Contribution;
  dismiss: () => void;
}) {
  if (contribution === undefined) {
    return <div className="contributionDetail" />;
  }
  return (
    <div className="contributionDetail showing">
      <h1>Contribution</h1>
      <button onClick={() => dismiss()}>Dismiss</button>
      <div>
        <span>Mapped Functions</span>
        {contribution.mapfns.map((fn, i) => (
          <pre key={i}>
            <code>{pprint(fn)}</code>
          </pre>
        ))}
      </div>
      <div>
        <span>Writer</span>
        <pre>
          <code>{contribution.writer}</code>
        </pre>
      </div>
      <div>
        <span>Files</span>
        {contribution.files.map((f, i) => (
          <pre key={i}>
            <code>{pprint(f)}</code>
          </pre>
        ))}
      </div>
    </div>
  );
}

export function KeyVisualisation() {
  const svgRef = useRef<SVGSVGElement>(null);

  const [contribution, setContribution] = useState<Contribution | undefined>(
    undefined,
  );

  const [vis, setVis] = useState<Vis | undefined>(undefined);

  useLayoutEffect(() => {
    const dag = buildDataModel(getData());
    const vis = createKeyVis(svgRef.current!!, dag, setContribution);
    setVis(vis);
  }, []);

  return (
    <div id="keyvis">
      <svg width="100%" height="100%" ref={svgRef}></svg>
      <ContributionDetail
        contribution={contribution}
        dismiss={() => {
          setContribution(undefined);
          console.log(": [etpty] vis: ", vis);
          vis?.clearViewing();
          vis?.update();
        }}
      />
    </div>
  );
}

function pprint(k: Key | File) {
  if (typeof k === "string") {
    return k;
  }
  return JSON.stringify(k);
}

function getData(): Source {
  return JSON.parse(data);
}

function buildDataModel(src: Source): d3dag.Graph<DirNode, undefined> {
  const nodes: DirNode[] = [];

  const nodeIdx = new Map();

  function walk(src: Source) {
    const id = src.dir;

    let idx = nodeIdx.get(id);

    if (idx === undefined) {
      idx = nodes.length;
      nodeIdx.set(id, idx);
      const node = {
        dir: src.dir,
        keys: [src],
        id: id,
        parentIds: src.dir_is_input
          ? []
          : src.contributions.map((c) => c.source!.dir),
      };
      nodes.push(node);
    } else {
      const node = nodes[idx];

      node.keys.push(src);
      if (!src.dir_is_input) {
        src.contributions
          .map((c) => c.source!.dir)
          .forEach((x) => node.parentIds.push(x));
      }
    }

    for (const c of src.contributions ?? []) {
      if (!src.dir_is_input) {
        walk(c.source!);
      }
    }
  }

  walk(src);

  // dedup parents before we stratify otherwise the graph layout
  // algorithm has a meltdown
  for (const node of nodes) {
    node.parentIds = [...new Set(node.parentIds)];
  }

  return d3dag.graphStratify()(nodes);
}

function createKeyVis(
  svgElem: SVGSVGElement,
  dag: d3dag.Graph<DirNode, undefined>,
  viewDetailsFor: (c: Contribution) => void,
): Vis {
  const highlightedDirs = new Set<string>();
  const highlightedSources = new Set<Source>();
  let viewing: Source | null = null;

  const highlight = (src?: Source | null) => {
    // undefined is we couldn't find a src
    if (src === undefined) {
      return;
    }

    // null is an explicit sentinel for clearing
    if (src === null) {
      highlightedDirs.clear();
      highlightedSources.clear();
      return;
    }

    highlightedDirs.add(src.dir);
    highlightedSources.add(src);
    src.contributions.forEach((c) => highlight(c.source));
  };

  const updateVis = createDagVis<DirNode, undefined>(
    svgElem,
    dag,
    // node enter
    (div) => {
      div.classed("highlighted", (d) => highlightedDirs.has(d.data.id));
      div
        .append("div")
        .classed("dir-title", true)
        .append("pre")
        .text("Dir: ")
        .attr("class", "dir")
        .append("code")
        .text((d) => d.data.dir);

      const keys = div.append("div").classed("keys", true);
      keys.append("span").text("Keys").attr("class", "heading");

      keys
        .selectAll("div")
        .data((d) => d.data.keys)
        .join((enter) => {
          const div = enter.append("div");

          div
            .append("pre")
            .attr("class", "key")
            .append("code")
            .text((d) => pprint(d.key));

          const contributions = div
            .append("div")
            .attr("class", "contributions");

          contributions.append("span").text("Files").attr("class", "heading");

          contributions
            .selectAll("div")
            .data((d) => d.contributions)
            .join((enter) => {
              const div = enter.append("div").attr("class", "contribution");

              div.on("mouseout", () => {
                highlight(null);
                highlight(viewing);
                updateVis();
              });
              div.on("mouseover", (_e, d) => {
                if (d.source) {
                  highlight(null);
                  highlight(d.source);
                  updateVis();
                }
              });

              div
                .append("div")
                .selectAll("pre")
                .data((d) => d.files)
                .join((enter) => {
                  return enter
                    .append("pre")
                    .attr("class", "file")
                    .append("code");
                })
                .text((d) => pprint(d));

              div
                .append("pre")
                .attr("class", "tick")
                .append("code")
                .text((d) => "Tick: " + d.tick);

              div
                .append("pre")
                .attr("class", "codelink")
                .append("code")
                .append("a")
                .text(() => "Detail")
                .attr("href", "#")
                .on("click", (_e, d) => {
                  viewing = d.source ?? null;
                  viewDetailsFor(d);
                });

              // div.append("p").text((d) => d.writer);

              return div;
            });

          return div;
        });
    },
    // node update
    (div) => {
      div.classed("highlighted", (d) => highlightedDirs.has(d.data.id));
      div
        .selectAll(".keys")
        .selectAll("div")
        .selectAll(".contributions")
        //@ts-ignore
        .classed("highlighted", (d) => highlightedSources.has(d));
    },
    // link enter
    (d) => {
      d.attr("marker-end", (d) =>
        highlightedDirs.has(d.source.data.id)
          ? "url(#arrow-highlighted)"
          : "url(#arrow)",
      );
    },
    // link update
    (d) => {
      d.attr("marker-end", (d) =>
        highlightedDirs.has(d.source.data.id)
          ? "url(#arrow-highlighted)"
          : "url(#arrow)",
      ).classed("highlighted", (d) => highlightedDirs.has(d.source.data.id));
    },
  );

  return {
    update: updateVis,
    clearViewing: () => {
      viewing = null;
      highlight(null);
    },
  };
}
