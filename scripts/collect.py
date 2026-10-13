#!/usr/bin/env python3
"""Conservative, dependency-free RSS collector. No verified pair means no write."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BEIJING = ZoneInfo("Asia/Shanghai")
MAX_BYTES = 2_000_000
TIMEOUT = 12
MAX_AGE = timedelta(hours=48)
USER_AGENT = "DailyBrief/1.0 (+https://github.com/Zhangsfish/daily_tasks)"
UNCERTAINTY = "两家独立来源的标题与时间相互印证；自动核查未逐项验证正文细节，事件仍可能变化。"

SOURCES = {
    "global": [
        ("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml", ("bbc.co.uk", "bbc.com")),
        ("The Guardian", "https://www.theguardian.com/world/rss", ("theguardian.com",)),
        ("NPR", "https://feeds.npr.org/1004/rss.xml", ("npr.org",)),
    ],
    "ai": [
        ("TechCrunch", "https://techcrunch.com/category/artificial-intelligence/feed/", ("techcrunch.com",)),
        ("The Verge", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", ("theverge.com",)),
        ("VentureBeat", "https://venturebeat.com/category/ai/feed/", ("venturebeat.com",)),
    ],
}


@dataclass(frozen=True)
class Story:
    section: str
    source: str
    title: str
    url: str
    published_at: datetime
    hosts: tuple[str, ...]


def host_allowed(url: str, hosts: tuple[str, ...]) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and bool(host) and any(host == allowed or host.endswith("." + allowed) for allowed in hosts)


def single_topic(url: str, title: str) -> bool:
    """Reject roundups whose headline may contain several unrelated claims."""
    path = urlparse(url).path.lower()
    return "newsletter" not in path and "roundup" not in path and not re.search(r"[.!?]\s+and[,\s]", title, re.I)


def request_bytes(url: str, limit: int = MAX_BYTES) -> tuple[bytes, str, str]:
    with urlopen(Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, text/html;q=0.8"}), timeout=TIMEOUT) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("response exceeds size limit")
        return data, response.geturl(), response.headers.get("content-type", "")


def child_text(element: ET.Element, names: tuple[str, ...]) -> str:
    for child in element:
        if child.tag.rsplit("}", 1)[-1].lower() in names and child.text:
            return child.text.strip()
    return ""


def parse_date(value: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
    except (ValueError, TypeError):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return dt.astimezone(timezone.utc) if dt.tzinfo else None


def parse_feed(data: bytes, section: str, source: str, hosts: tuple[str, ...], now: datetime) -> list[Story]:
    root = ET.fromstring(data)
    stories = []
    for entry in root.iter():
        if entry.tag.rsplit("}", 1)[-1].lower() not in ("item", "entry"):
            continue
        title = " ".join(unescape(child_text(entry, ("title",))).split())
        url = child_text(entry, ("link",))
        if not url:
            for child in entry:
                if child.tag.rsplit("}", 1)[-1].lower() == "link" and child.attrib.get("rel", "alternate") == "alternate":
                    url = child.attrib.get("href", "")
                    break
        published = parse_date(child_text(entry, ("pubdate", "published", "updated", "date")))
        if title and url and single_topic(url, title) and host_allowed(url, hosts) and published and timedelta(0) <= now - published <= MAX_AGE:
            stories.append(Story(section, source, title, url, published, hosts))
    return stories


STOPWORDS = set("the a an and or of for to in on at from with by is are was were as it its this that new says said after over about ai artificial intelligence how why what who amid into more latest live update news".split())


def tokens(title: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9][a-z0-9'-]*", title.lower()) if len(word) > 2 and word not in STOPWORDS}


def corroborates(first: Story, second: Story) -> bool:
    if first.source == second.source or first.section != second.section or first.url == second.url:
        return False
    if abs(first.published_at - second.published_at) > timedelta(hours=36):
        return False
    a, b = tokens(first.title), tokens(second.title)
    if len(a) < 3 or len(b) < 3:
        return False
    common = a & b
    jaccard = len(common) / len(a | b)
    sequence = SequenceMatcher(None, first.title.lower(), second.title.lower()).ratio()
    return len(common) >= 3 and jaccard >= 0.28 and sequence >= 0.45


class TitleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self.inside = True

    def handle_endtag(self, tag):
        if tag == "title":
            self.inside = False

    def handle_data(self, data):
        if self.inside:
            self.parts.append(data)


def verify_article(story: Story) -> bool:
    try:
        data, final_url, content_type = request_bytes(story.url, limit=500_000)
        if not host_allowed(final_url, story.hosts) or "html" not in content_type.lower():
            return False
        parser = TitleParser()
        parser.feed(data.decode("utf-8", errors="replace"))
        page_tokens = tokens(" ".join(parser.parts))
        return len(tokens(story.title) & page_tokens) >= 2
    except (OSError, ValueError, UnicodeError, ET.ParseError):
        return False


def collect(now: datetime, fetch=request_bytes, verify=verify_article) -> dict:
    sections = {}
    errors = []
    diagnostics = {}
    for section, feeds in SOURCES.items():
        candidates = []
        feed_counts = {}
        for source, feed_url, hosts in feeds:
            try:
                data, final_url, _ = fetch(feed_url)
                if not host_allowed(final_url, (urlparse(feed_url).hostname or "",)):
                    raise ValueError("feed redirected to unapproved host")
                stories = parse_feed(data, section, source, hosts, now)
                feed_counts[source] = len(stories)
                candidates.extend(stories)
            except (OSError, ValueError, ET.ParseError) as error:
                feed_counts[source] = 0
                errors.append(f"{source}: {type(error).__name__}: {error}")
        candidates.sort(key=lambda story: story.published_at, reverse=True)
        pair_scores = []
        for index, left in enumerate(candidates):
            for right in candidates[index + 1:]:
                if left.source == right.source or abs(left.published_at - right.published_at) > timedelta(hours=36):
                    continue
                left_words, right_words = tokens(left.title), tokens(right.title)
                if not left_words or not right_words:
                    continue
                common = len(left_words & right_words)
                jaccard = common / len(left_words | right_words)
                sequence = SequenceMatcher(None, left.title.lower(), right.title.lower()).ratio()
                pair_scores.append((round(jaccard, 2), common, round(sequence, 2)))
        chosen = []
        used_urls = set()
        verified_urls = {}
        title_pairs = 0
        reachable_pairs = 0
        for first in candidates:
            if first.url in used_urls:
                continue
            for second in candidates:
                if second.url in used_urls or not corroborates(first, second):
                    continue
                title_pairs += 1
                if first.url not in verified_urls:
                    verified_urls[first.url] = verify(first)
                if second.url not in verified_urls:
                    verified_urls[second.url] = verify(second)
                if not verified_urls[first.url] or not verified_urls[second.url]:
                    continue
                reachable_pairs += 1
                chosen.append({
                    "title": first.title,
                    "source": first.source,
                    "url": first.url,
                    "published_at": first.published_at.isoformat(),
                    "checked_at": now.isoformat(),
                    "corroboration": {"source": second.source, "url": second.url, "published_at": second.published_at.isoformat()},
                    "uncertainty": UNCERTAINTY,
                })
                used_urls.update((first.url, second.url))
                break
            if len(chosen) >= 4:
                break
        sections[section] = chosen
        diagnostics[section] = {"feed_entries": feed_counts, "top_pair_scores": sorted(pair_scores, reverse=True)[:5], "matching_title_pairs": title_pairs, "verified_article_pairs": reachable_pairs}
    if not sections["global"] or not sections["ai"]:
        raise RuntimeError(f"verification gate failed: global={len(sections['global'])}, ai={len(sections['ai'])}; diagnostics: {json.dumps(diagnostics, ensure_ascii=False)}; feed errors: {'; '.join(errors) or 'none'}")
    return {"date": now.astimezone(BEIJING).date().isoformat(), "generated_at": now.isoformat(), "sections": sections}


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)


def publish(snapshot: dict, root: Path = ROOT) -> None:
    day = snapshot["date"]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) or not snapshot["sections"]["global"] or not snapshot["sections"]["ai"]:
        raise ValueError("snapshot did not pass publication gate")
    index_path = root / "archive/index.json"
    days = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
    days = sorted(set(days + [day]), reverse=True)
    write_json(root / f"archive/{day}.json", snapshot)
    write_json(index_path, days)
    write_json(root / "data/latest.json", snapshot)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="check live sources without writing files")
    args = parser.parse_args()
    try:
        snapshot = collect(datetime.now(timezone.utc))
        if not args.dry_run:
            publish(snapshot)
    except Exception as error:
        print(f"Collection stopped; no new edition published: {error}", file=sys.stderr)
        return 1
    print(f"Verified {snapshot['date']}: " + ", ".join(f"{name}={len(items)}" for name, items in snapshot["sections"].items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
