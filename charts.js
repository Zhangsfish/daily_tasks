(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";

  function svgNode(tag, attributes = {}, value) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, entry]) => node.setAttribute(key, String(entry)));
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function safeSource(url) {
    const resolved = new URL(url, location.href);
    if (!["http:", "https:"].includes(resolved.protocol)) throw new Error("图表来源必须是 HTTP(S) 链接");
    return resolved;
  }

  function dataFor(spec, latest) {
    if (spec.dataset === "latest-sections") {
      if (!latest || !latest.sections || !Array.isArray(latest.sections.global) || !Array.isArray(latest.sections.ai)) {
        throw new Error("本期数据暂时无法载入");
      }
      return {
        labels: ["全球新闻", "AI 动态"],
        values: [latest.sections.global.length, latest.sections.ai.length],
        source: "本期已核查简报",
        source_url: "data/latest.json"
      };
    }
    return spec;
  }

  function validate(spec, latest) {
    if (!spec || !["bar", "line"].includes(spec.type)) throw new Error("仅支持 bar 或 line 图表");
    if (typeof spec.title !== "string" || !spec.title.trim() || spec.title.length > 100) throw new Error("图表标题无效");
    const data = dataFor(spec, latest);
    if (!Array.isArray(data.labels) || !Array.isArray(data.values) || data.labels.length !== data.values.length ||
        data.labels.length < (spec.type === "line" ? 2 : 1) || data.labels.length > 8) {
      throw new Error("图表需要 1–8 个同长度的标签和数值");
    }
    if (data.labels.some(label => typeof label !== "string" || !label.trim() || label.length > 24) ||
        data.values.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e9)) {
      throw new Error("图表标签或数值无效");
    }
    if (typeof data.source !== "string" || !data.source.trim() || typeof data.source_url !== "string") {
      throw new Error("图表必须注明数据来源");
    }
    return {...data, type: spec.type, title: spec.title, unit: typeof spec.unit === "string" ? spec.unit.slice(0, 18) : "",
      note: typeof spec.note === "string" ? spec.note.slice(0, 250) : ""};
  }

  function render(spec, latest) {
    const data = validate(spec, latest);
    const figure = document.createElement("figure");
    figure.className = "chart";
    const heading = document.createElement("figcaption");
    heading.className = "chart-title";
    heading.textContent = data.title;
    figure.append(heading);

    const svg = svgNode("svg", {viewBox: "0 0 640 244", role: "img", class: "chart-svg", "aria-label": data.title});
    const max = Math.max(1, ...data.values);
    const rawStep = max / 4;
    const power = 10 ** Math.floor(Math.log10(rawStep));
    const scaled = rawStep / power;
    const niceStep = (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
    const step = data.values.every(Number.isInteger) && max <= 10 ? Math.max(1, Math.ceil(max / 4)) : niceStep;
    const ceiling = (Math.ceil(max / step) + 1) * step;
    const tickCount = Math.round(ceiling / step);
    const left = 50, right = 615, top = 18, bottom = 180;
    for (let i = 0; i <= tickCount; i++) {
      const y = bottom - (bottom - top) * i / tickCount;
      svg.append(svgNode("line", {x1: left, y1: y, x2: right, y2: y, stroke: "#e1e6e2", "stroke-width": 1}));
      svg.append(svgNode("text", {x: left - 8, y: y + 4, "text-anchor": "end", fill: "#788487", "font-size": 11}, String(Number((step * i).toFixed(4)))));
    }
    const span = (right - left) / data.labels.length;
    const points = [];
    data.values.forEach((value, index) => {
      const x = left + span * (index + .5);
      const y = bottom - value / ceiling * (bottom - top);
      if (data.type === "bar") {
        const width = Math.min(60, span * .56);
        svg.append(svgNode("rect", {x: x - width / 2, y, width, height: Math.max(1, bottom - y), rx: 2, fill: "#39766c"}));
      } else {
        points.push([x, y]);
      }
      svg.append(svgNode("text", {x, y: 210, "text-anchor": "middle", fill: "#607073", "font-size": 11}, data.labels[index]));
      svg.append(svgNode("text", {x, y: Math.max(top + 2, y - 8), "text-anchor": "middle", fill: "#275c57", "font-size": 11, "font-weight": 700}, String(value)));
    });
    if (data.type === "line") {
      svg.append(svgNode("polyline", {points: points.map(point => point.join(",")).join(" "), fill: "none", stroke: "#39766c", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round"}));
      points.forEach(([x, y]) => svg.append(svgNode("circle", {cx: x, cy: y, r: 4, fill: "#39766c"})));
    }
    figure.append(svg);
    const caption = document.createElement("div");
    caption.className = "chart-caption";
    const source = document.createElement("a");
    source.href = safeSource(data.source_url).href;
    source.textContent = `来源：${data.source} ↗`;
    if (new URL(source.href).origin !== location.origin) {
      source.target = "_blank";
      source.rel = "noopener noreferrer";
    }
    caption.append(source);
    if (data.unit) {
      const unit = document.createElement("span");
      unit.textContent = `单位：${data.unit}`;
      caption.append(unit);
    }
    if (data.note) {
      const note = document.createElement("span");
      note.textContent = data.note;
      caption.append(note);
    }
    figure.append(caption);
    return figure;
  }

  global.SimpleCharts = {render, validate};
})(window);
