const labels = {global: "全球新闻", ai: "AI 动态"};
const notice = document.querySelector("#notice");
const formatter = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false});
function time(value) { return value ? formatter.format(new Date(value)) + " 北京时间" : "时间未知"; }
function showNotice(message) { notice.textContent = message; notice.hidden = false; }
function node(tag, className, value) { const el = document.createElement(tag); if (className) el.className = className; if (value !== undefined) el.textContent = value; return el; }
function link(url, label) { const a = node("a", "", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }
function renderSection(kind, items) {
  const root = document.querySelector(`#${kind}-items`); root.replaceChildren();
  if (!items?.length) { root.append(node("div", "empty", "暂无通过核查的内容。采集失败或证据不足时，本站不会补写未经证实的消息。")); return; }
  for (const item of items) {
    const card = node("article", "card");
    const top = node("div", "card-top"); top.append(node("span", "", labels[kind]), node("span", "", time(item.published_at))); card.append(top);
    const heading = node("h3"); heading.append(link(item.url, item.title)); card.append(heading);
    card.append(node("p", "", `原文：${item.source} · 核查：${time(item.checked_at)}`));
    const sources = node("div", "source-row"); sources.append(link(item.url, "阅读原文 ↗"), link(item.corroboration.url, `交叉来源：${item.corroboration.source} · ${time(item.corroboration.published_at)} ↗`)); card.append(sources);
    card.append(node("p", "uncertainty", `核查边界：${item.uncertainty}`)); root.append(card);
  }
}
async function loadEdition(path) {
  const response = await fetch(path, {cache: "no-store"}); if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json(); if (!data.sections || !Array.isArray(data.sections.global) || !Array.isArray(data.sections.ai)) throw new Error("数据格式无效");
  document.querySelector("#edition").textContent = data.date ? `${data.date} · 今日简报` : "等待首份核查简报";
  document.querySelector("#updated").textContent = data.generated_at ? `最近核查 ${time(data.generated_at)}` : "尚无已核查内容";
  renderSection("global", data.sections.global); renderSection("ai", data.sections.ai);
}
async function init() {
  try { await loadEdition("data/latest.json"); } catch (error) { showNotice("简报载入失败，请稍后重试或查看仓库归档。" ); renderSection("global", []); renderSection("ai", []); }
  try {
    const response = await fetch("archive/index.json", {cache: "no-store"}); if (!response.ok) throw new Error();
    const days = await response.json(); const root = document.querySelector("#archive-list"); root.replaceChildren();
    if (!days.length) { root.append(node("span", "empty", "首份通过核查的简报发布后，归档会显示在这里。")); return; }
    for (const day of days) { const button = node("button", "", day); button.type = "button"; button.addEventListener("click", async () => { try { await loadEdition(`archive/${day}.json`); document.querySelectorAll("#archive-list button").forEach(b => b.removeAttribute("aria-current")); button.setAttribute("aria-current", "true"); window.scrollTo({top: 0, behavior: "smooth"}); } catch { showNotice("该期归档暂时无法载入。"); } }); root.append(button); }
  } catch { showNotice("归档列表暂时无法载入。"); }
}
init();
