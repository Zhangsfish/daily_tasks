const titleElement = document.querySelector("#article-title");
const summaryElement = document.querySelector("#article-summary");
const metaElement = document.querySelector("#article-meta");
const bodyElement = document.querySelector("#article-body");
const noticeElement = document.querySelector("#article-notice");
const actionsElement = document.querySelector("#article-actions");

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
    link.textContent = heading.classList.contains("transcript-time") ? heading.firstChild.textContent : heading.textContent;
    if (heading.tagName === "H3") link.style.paddingLeft = "12px";
    toc.append(link);
  });
  if (!toc.childElementCount) toc.textContent = "暂无章节";
}

function renderTimestamps(sourceUrl) {
  bodyElement.querySelectorAll("p").forEach(paragraph => {
    const match = /^\[(\d{2}):(\d{2}):(\d{2})\]$/.exec(paragraph.textContent.trim());
    if (!match) return;
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    const heading = document.createElement("h2");
    heading.className = "transcript-time";
    heading.append(document.createTextNode(`${match[1]}:${match[2]}:${match[3]}`));
    const link = document.createElement("a");
    link.href = `${sourceUrl}?t=${seconds}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "在原视频查看 ↗";
    heading.append(link);
    paragraph.replaceWith(heading);
  });
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
  const isTranscript = note.type === "transcript";
  bodyElement.classList.toggle("is-transcript", isTranscript);
  for (const value of [isTranscript ? `整理于 ${note.date}` : note.date, note.read_minutes ? `约 ${note.read_minutes} 分钟阅读` : ""]) {
    if (value) {
      const span = document.createElement("span");
      span.textContent = value;
      metaElement.append(span);
    }
  }
  actionsElement.replaceChildren();
  if (isTranscript) {
    document.querySelector("#article-kicker").textContent = "VIDEO TRANSCRIPT";
    document.querySelector("#article-back").href = "./#transcripts";
    document.querySelector("#article-back").textContent = "← 返回视频文稿";
    document.querySelector("#notes-nav").removeAttribute("aria-current");
    document.querySelector("#transcript-nav").setAttribute("aria-current", "page");
    const source = document.createElement("a");
    source.href = note.source;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "查看原视频 ↗";
    actionsElement.append(source);
    if (note.transcript_slug) {
      const full = document.createElement("a");
      full.href = `article.html?slug=${encodeURIComponent(note.transcript_slug)}`;
      full.textContent = "阅读完整文字稿 →";
      actionsElement.append(full);
    }
    if (note.guide_slug) {
      const guide = document.createElement("a");
      guide.href = `article.html?slug=${encodeURIComponent(note.guide_slug)}`;
      guide.textContent = "阅读快速导读 →";
      actionsElement.append(guide);
    }
    noticeElement.textContent = "此页是视频语音转写或人工导读，未逐项核查嘉宾说法。转写可能有同音字、专名和数字错误；关键内容请对照原视频。";
    noticeElement.hidden = false;
    document.querySelector("#article-side-kicker").textContent = "TRANSCRIPT NOTE";
    document.querySelector("#article-side-title").textContent = "关于这份文稿";
    document.querySelector("#article-side-text").textContent = "页面保留原视频入口和时间轴。嘉宾观点不代表本站核实的事实，也不属于每日新闻简报。";
  }
  document.title = `${note.title} · 每日资讯`;

  const md = window.markdownit({html: false, linkify: true, typographer: true});
  bodyElement.innerHTML = md.render(source);
  if (isTranscript) {
    if (bodyElement.firstElementChild?.tagName === "H1") bodyElement.firstElementChild.remove();
    renderTimestamps(note.source.replace(/\/?$/, "/"));
  }
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
