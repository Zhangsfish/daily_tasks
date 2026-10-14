const labels = {global: "全球新闻", ai: "AI 动态"};
const formatter = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false});
const notice = document.querySelector("#notice");
let currentEditionDate = null;

function el(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function formatTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "时间未知";
  return formatter.format(new Date(value)) + " 北京时间";
}

function safeLink(url, label) {
  const link = el("a", "", label);
  const target = new URL(url, location.href);
  if (!["https:", "http:"].includes(target.protocol)) return el("span", "", label);
  link.href = target.href;
  if (target.origin !== location.origin) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

function renderSection(kind, items) {
  const root = document.querySelector(`#${kind}-items`);
  root.replaceChildren();
  document.querySelector(`#${kind}-count`).textContent = String(items.length).padStart(2, "0");
  document.querySelector(`#side-${kind}-count`).textContent = String(items.length);
  if (!items.length) {
    root.append(el("p", "empty", "暂无通过核查的内容。证据不足时，我们会保留上一期已核查的简报。"));
    return;
  }
  items.forEach((item, index) => {
    const story = el("article", "story");
    story.append(el("span", "story-number", String(index + 1).padStart(2, "0")));
    const body = el("div", "story-body");
    const meta = el("div", "story-meta");
    meta.append(el("span", "story-source", item.source), el("span", "", formatTime(item.published_at)));
    body.append(meta);

    const heading = el("h3", "story-title");
    heading.append(safeLink(item.url, item.title));
    body.append(heading);

    const links = el("div", "story-links");
    links.append(
      safeLink(item.url, "阅读原文 ↗"),
      safeLink(item.corroboration.url, `交叉来源：${item.corroboration.source} · ${formatTime(item.corroboration.published_at)} ↗`)
    );
    body.append(links);

    const uncertainty = el("p", "story-uncertainty");
    uncertainty.append(el("strong", "", "核查边界  "), document.createTextNode(item.uncertainty));
    body.append(uncertainty);
    story.append(body);
    root.append(story);
  });
}

async function loadEdition(path) {
  const response = await fetch(path, {cache: "no-store"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.sections || !Array.isArray(data.sections.global) || !Array.isArray(data.sections.ai)) throw new Error("简报格式无效");
  currentEditionDate = data.date;
  document.querySelector("#edition").textContent = data.date ? `${data.date} · 已核查简报` : "等待首份核查简报";
  document.querySelector("#updated").textContent = data.generated_at ? `核查于 ${formatTime(data.generated_at)}` : "尚无已核查内容";
  document.querySelector("#side-date").textContent = data.date ? `本期日期：${data.date}（北京时间）` : "尚无已核查内容";
  renderSection("global", data.sections.global);
  renderSection("ai", data.sections.ai);
  document.querySelectorAll("#archive-list button").forEach(button => {
    if (button.dataset.day === data.date) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  return data;
}

async function loadNotes() {
  const root = document.querySelector("#notes-list");
  const transcriptsRoot = document.querySelector("#transcript-list");
  try {
    const response = await fetch("content/index.json", {cache: "no-store"});
    if (!response.ok) throw new Error();
    const notes = await response.json();
    if (!Array.isArray(notes)) throw new Error();
    root.replaceChildren();
    transcriptsRoot.replaceChildren();
    for (const note of notes) {
      if (!/^[a-z0-9-]+$/.test(note.slug)) continue;
      if (note.type === "transcript") {
        if (note.hide_from_list) continue;
        const card = el("article", "transcript-card");
        const title = el("h3", "transcript-title");
        const link = el("a", "", note.title);
        link.href = `article.html?slug=${encodeURIComponent(note.slug)}`;
        title.append(link);
        card.append(title, el("p", "transcript-description", note.description));
        const links = el("div", "transcript-links");
        if (note.transcript_slug && /^[a-z0-9-]+$/.test(note.transcript_slug)) {
          const full = el("a", "", "阅读完整稿 →");
          full.href = `article.html?slug=${encodeURIComponent(note.transcript_slug)}`;
          links.append(full);
        }
        if (note.guide_slug && /^[a-z0-9-]+$/.test(note.guide_slug)) {
          const guide = el("a", "", "阅读快速导读 →");
          guide.href = `article.html?slug=${encodeURIComponent(note.guide_slug)}`;
          links.append(guide);
        }
        if (typeof note.source === "string" && note.source.startsWith("https://www.bilibili.com/video/")) {
          const source = el("a", "", "原视频 ↗");
          source.href = note.source;
          source.target = "_blank";
          source.rel = "noopener noreferrer";
          links.append(source);
        }
        card.append(links);
        transcriptsRoot.append(card);
        continue;
      }
      const link = el("a", "note-link", note.title);
      link.href = `article.html?slug=${encodeURIComponent(note.slug)}`;
      link.append(el("small", "", note.description));
      root.append(link);
    }
    if (!root.childElementCount) root.append(el("span", "side-note", "暂无阅读笔记。"));
    if (!transcriptsRoot.childElementCount) transcriptsRoot.append(el("p", "empty", "暂无视频文稿。"));
  } catch {
    root.replaceChildren(el("span", "side-note", "阅读笔记暂时无法载入。"));
    transcriptsRoot.replaceChildren(el("p", "empty", "视频文稿暂时无法载入。"));
  }
}

async function loadArchive() {
  const root = document.querySelector("#archive-list");
  try {
    const response = await fetch("archive/index.json", {cache: "no-store"});
    if (!response.ok) throw new Error();
    const days = await response.json();
    if (!Array.isArray(days)) throw new Error();
    root.replaceChildren();
    if (!days.length) {
      root.append(el("p", "empty", "首份通过核查的简报发布后，归档会显示在这里。"));
      return;
    }
    days.forEach(day => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      const button = el("button", "", day);
      button.type = "button";
      button.dataset.day = day;
      if (day === currentEditionDate) button.setAttribute("aria-current", "true");
      button.addEventListener("click", async () => {
        try {
          await loadEdition(`archive/${day}.json`);
          window.scrollTo({top: 0, behavior: "smooth"});
        } catch {
          showNotice("该期归档暂时无法载入。");
        }
      });
      root.append(button);
    });
  } catch {
    root.replaceChildren(el("p", "empty", "归档列表暂时无法载入。"));
  }
}

async function init() {
  try {
    await loadEdition("data/latest.json");
  } catch {
    showNotice("简报载入失败，请稍后重试或查看仓库归档。");
    renderSection("global", []);
    renderSection("ai", []);
  }
  await Promise.all([loadArchive(), loadNotes()]);
}

init();
