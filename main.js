
(function () {
  "use strict";

  // hardcoded years and months
  const YEARS = [2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017];
  const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // cell dimensions and padding
  const cellWidth = 72;
  const cellHeight = 52;
  const linePadding = 4;
  // padding for the matrix
  const paddingLeft = 80;
  const paddingTop = 40;
  const paddingRight = 20;
  const paddingBottom = 30;
  const legendBarWidth = 24;
  const legendGap = 16;

  // start on max temp view
  let useMax = true;
  let data = null;
  let matrixG = null;
  const tooltip = d3.select("#tooltip");
  //legend graient
  const legendColors = ["#6a0dad", "#1e90ff", "#f5f57a", "#ffd700", "#ff8c00", "#dc143c"]; // purple → blue → light yellow → yellow → orange → red
  const colorScale = d3.scaleLinear()
    .domain([0, 8, 16, 24, 32, 40])
    .range(legendColors);

  // build grid from csv rows (month/year groups)
  function buildGridFromRows(rows) {
    const parseDate = d3.timeParse("%Y-%m-%d");
    const raw = rows.map((r) => ({
      date: parseDate(r.date),
      max: +r.max_temperature,
      min: +r.min_temperature,
    })).filter((d) => d.date);

    // group by year and month, calculate max and min temperatures
    const byYearMonth = d3.rollup(
      raw,
      (group) => {
        const sorted = group.sort((a, b) => a.date.getDate() - b.date.getDate());
        return {
          month_max: d3.max(sorted, (d) => d.max),
          month_min: d3.min(sorted, (d) => d.min),
          daily: sorted.map((d) => ({ max: d.max, min: d.min })),
        };
      },
      (d) => d.date.getFullYear(),
      (d) => d.date.getMonth() + 1
    );

    // create cells array
    const cells = [];
    YEARS.forEach((year, xi) => {
      MONTHS.forEach((month, yi) => {
        const value = byYearMonth.get(year)?.get(month);
        if (value) {
          cells.push({ year, month, xi, yi, ...value });
        }
      });
    });
    return cells;
  }

  // create line path for the mini line charts
  function linePath(values, tempMin, tempMax) {
    if (values.length < 2) return null;
    const w = cellWidth - 2 * linePadding;
    const h = cellHeight - 2 * linePadding;
    const range = tempMax - tempMin || 1;
    const scaleY = (v) => h - ((v - tempMin) / range) * h;
    const scaleX = (i) => (i / (values.length - 1)) * w;
    return d3.line()
      .x((_, i) => linePadding + scaleX(i))
      .y((v) => linePadding + scaleY(v))(values);
  }


  // draw the matrix, axes, cells, and legend
  function draw() {
    const cells = data;
    const gridWidth = YEARS.length * cellWidth;
    const gridHeight = MONTHS.length * cellHeight;
    const totalWidth = paddingLeft + gridWidth + legendGap + legendBarWidth + 32 + paddingRight;
    const totalHeight = paddingTop + gridHeight + paddingBottom;

    d3.select("#matrix-wrap").selectAll("*").remove();
    const svg = d3.select("#matrix-wrap")
      .append("svg")
      .attr("width", totalWidth)
      .attr("height", totalHeight);

    // scales for the axes
    const xScale = d3.scaleBand()
      .domain(YEARS.map(String))
      .range([0, gridWidth])
      .padding(0);
    const yScale = d3.scaleBand()
      .domain(MONTHS.map(String))
      .range([0, gridHeight])
      .padding(0);

    // Year labels (x-axis)
    const yearLabels = svg.append("g")
      .attr("transform", `translate(${paddingLeft},${paddingTop - 8})`);
    yearLabels.selectAll("text")
      .data(YEARS)
      .join("text")
      .attr("x", (y) => xScale(String(y)) + xScale.bandwidth() / 2)
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .text((y) => y);

    // Month labels (y-axis)
    const monthLabels = svg.append("g")
      .attr("transform", `translate(${paddingLeft - 8},${paddingTop})`);
    monthLabels.selectAll("text")
      .data(MONTHS)
      .join("text")
      .attr("x", 0)
      .attr("y", (m) => yScale(String(m)) + yScale.bandwidth() / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10)
      .text((m) => MONTH_NAMES[m - 1]);

    // Matrix of cells
    matrixG = svg.append("g")
      .attr("transform", `translate(${paddingLeft},${paddingTop})`);
    const cell = matrixG.selectAll(".cell")
      .data(cells)
      .join("g")
      .attr("class", "cell")
      .attr("transform", (d) => `translate(${d.xi * cellWidth},${d.yi * cellHeight})`);

    // create cells
    cell.append("rect")
      .attr("class", "cell-rect")
      .attr("width", cellWidth)
      .attr("height", cellHeight)
      .attr("fill", (d) => colorScale(useMax ? d.month_max : d.month_min))
      .attr("stroke", "rgba(0,0,0,0.12)")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      // toggle max/min view
      .on("click", () => {
        useMax = !useMax;
        matrixG.selectAll(".cell-rect")
          .attr("fill", (d) => colorScale(useMax ? d.month_max : d.month_min));
      })
      .on("mouseover", function (event, d) {
        const dateStr = `${d.year}-${String(d.month).padStart(2, "0")}`;
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY + 10 + "px")
          .html(`Date: ${dateStr}, max: ${d.month_max} min: ${d.month_min}`)
          .classed("visible", true);
      })
      .on("mouseout", () => tooltip.classed("visible", false));

    // draw the line charts for each cell
    cell.each(function (d) {
      const daily = d.daily || [];
      if (daily.length < 2) return;
      const maxTemps = daily.map((x) => x.max);
      const minTemps = daily.map((x) => x.min);
      const tempMin = Math.min(...minTemps);
      const tempMax = Math.max(...maxTemps);
      const g = d3.select(this);
      //max temp line
      g.append("path")
        .attr("class", "cell-line cell-line-max")
        .attr("d", linePath(maxTemps, tempMin, tempMax));
      //min temp line
      g.append("path")
        .attr("class", "cell-line cell-line-min")
        .attr("d", linePath(minTemps, tempMin, tempMax));
    });

    // legend gradient
    const legendG = svg.append("g")
      .attr("transform", `translate(${paddingLeft + gridWidth + legendGap},${paddingTop})`);
    const gradient = legendG.append("defs")
      .append("linearGradient")
      .attr("id", "legend-gradient")
      .attr("x1", "0%").attr("x2", "0%")
      .attr("y1", "0%").attr("y2", "100%");
    for (let i = 0; i <= 5; i++) {
      gradient.append("stop")
        .attr("offset", (i / 5) * 100 + "%")
        .attr("stop-color", colorScale(i * 8));
    }
    legendG.append("rect")
      .attr("width", legendBarWidth)
      .attr("height", gridHeight)
      .attr("fill", "url(#legend-gradient)")
      .attr("rx", 3);
    // legend axis
    const legendAxis = d3.scaleLinear().domain([0, 40]).range([0, gridHeight]);
    legendG.append("g")
      .attr("transform", `translate(${legendBarWidth},0)`)
      .call(d3.axisRight(legendAxis).ticks(5).tickSize(4));
    legendG.append("text")
      .attr("x", legendBarWidth + 28)
      .attr("y", 0)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10)
      .text("C°");
  }

  // load csv and draw the matrix
  d3.csv("temperature_10y.csv")
    .then((rows) => {
      data = buildGridFromRows(rows);
      draw();
    })
    .catch(() => {
      document.getElementById("matrix-wrap").innerHTML =
        "<p>Using temperature_10y.csv.</p>";
    });
})();
