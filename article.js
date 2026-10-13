const titleElement = document.querySelector("#article-title");
const summaryElement = document.querySelector("#article-summary");
const metaElement = document.querySelector("#article-meta");
const bodyElement = document.querySelector("#article-body");
const noticeElement = document.querySelector("#article-notice");

async function fetchJson(path) {
  const response = await fetch(path, {cache: "no-store"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderContents() {
  const toc = document.querySelector("#article-toc");
  toc.replaceChildren();
  bodyElement.querySelectorAll("h2, h3").forEach((heading, index) => {
    heading.id = `section-${index + 1}`;
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent;
    if (heading.tagName === "H3") link.style.paddingLeft = "12px";
    toc.append(link);
  });
  if (!toc.childElementCount) toc.textContent = "暂无章节";
}

function renderCharts(latest) {
  bodyElement.querySelectorAll("pre > code.language-chart").forEach(code => {
    const pre = code.parentElement;
    try {
      const spec = JSON.parse(code.textContent);
      pre.replaceWith(SimpleCharts.render(spec, latest));
    } catch (error) {
      const message = document.createElement("p");
      message.className = "chart-error";
      message.textContent = `图表无法显示：${error.message}`;
      pre.replaceWith(message);
    }
  });
}

function markExternalLinks() {
  bodyElement.querySelectorAll("a[href]").forEach(link => {
    const destination = new URL(link.href);
    if (!["http:", "https:"].includes(destination.protocol)) {
      link.removeAttribute("href");
    } else if (destination.origin !== location.origin) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

async function initArticle() {
  const slug = new URLSearchParams(location.search).get("slug") || "reading-guide";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("文章地址无效");
  const notes = await fetchJson("content/index.json");
  if (!Array.isArray(notes)) throw new Error("文章目录无效");
  const note = notes.find(entry => entry.slug === slug);
  if (!note) throw new Error("找不到这篇文章");
  const [response, latest] = await Promise.all([
    fetch(`content/${slug}.md`, {cache: "no-store"}),
    fetchJson("data/latest.json").catch(() => null)
  ]);
  if (!response.ok) throw new Error("文章暂时无法载入");
  const source = await response.text();
  titleElement.textContent = note.title;
  summaryElement.textContent = note.description;
  metaElement.replaceChildren();
  for (const value of [note.date, note.read_minutes ? `约 ${note.read_minutes} 分钟阅读` : ""]) {
    if (value) {
      const span = document.createElement("span");
      span.textContent = value;
      metaElement.append(span);
    }
  }
  document.title = `${note.title} · 每日资讯`;

  const md = window.markdownit({html: false, linkify: true, typographer: true});
  bodyElement.innerHTML = md.render(source);
  markExternalLinks();
  renderCharts(latest);
  renderContents();
}

initArticle().catch(error => {
  titleElement.textContent = "文章暂时无法显示";
  summaryElement.textContent = "";
  noticeElement.textContent = error.message;
  noticeElement.hidden = false;
});
