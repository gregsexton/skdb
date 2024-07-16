import * as d3 from "d3";
import { useEffect } from "react";

export function KeyVisualisation() {
  useEffect(() => {
    drawVis();
  });
  return (
    <svg id="key_vis" width="100%" height="100%">
      <g id="key_vis_group"></g>
    </svg>
  );
}

function drawVis() {
  var myData = [40, 10, 20, 60, 30];

  d3.select("#key_vis_group")
    .selectAll("circle")
    .data(myData)
    .join("circle")
    .attr("cx", function (d, i) {
      return i * 100;
    })
    .attr("cy", 50)
    .attr("r", function (d) {
      return 0.5 * d;
    })
    .style("fill", "orange");
}
