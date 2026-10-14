"""Import approved Markdown transcripts from a local checkout of the private library.

The public site receives only the files named by index.json. Never copy raw SRT,
metadata beyond the fields shown on the site, or credentials into this repository.
"""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
INDEX = CONTENT / "index.json"
SLUG = re.compile(r"^[a-z0-9-]+$")


def source_file(library: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative:
        raise ValueError("Missing Markdown path in library index")
    path = (library / relative).resolve()
    if not path.is_relative_to(library) or path.suffix != ".md" or not path.is_file():
        raise ValueError(f"Invalid Markdown path: {relative}")
    return path


def entry_for(item: dict, slug: str, path: Path, date: str, *, guide=False, hidden=False):
    text = path.read_text(encoding="utf-8")
    if not text.strip() or not text.lstrip().startswith("# "):
        raise ValueError(f"Markdown is empty or has no title: {path}")
    duration = int(item["duration_seconds"])
    duration_label = f"{duration // 3600} 小时 {duration % 3600 // 60} 分钟" if duration >= 3600 else f"{duration // 60} 分钟"
    result = {
        "slug": slug,
        "title": item["title"] + ("（快速导读）" if guide else "（完整文字稿）"),
        "description": ("人工整理的导读" if guide else "语音识别整理稿") + f" · 视频时长 {duration_label}",
        "date": date,
        "type": "transcript",
        "source": item["source"],
        "video_id": item["video_id"],
    }
    if hidden:
        result["hide_from_list"] = True
    return result, text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("library", type=Path, help="Local checkout of video-transcript-library")
    args = parser.parse_args()
    library = args.library.resolve()
    data = json.loads((library / "index.json").read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("entries"), list):
        raise ValueError("Unsupported library index")
    existing = json.loads(INDEX.read_text(encoding="utf-8"))
    if not isinstance(existing, list):
        raise ValueError("Invalid site content index")
    notes = [note for note in existing if note.get("type") != "transcript"]
    files = {}
    seen = set()
    for item in data["entries"]:
        name = item["slug"]
        if not isinstance(name, str) or not SLUG.fullmatch(name) or name in seen:
            raise ValueError(f"Invalid or repeated slug: {name}")
        seen.add(name)
        source = item["source"]
        parsed = urlparse(source)
        if parsed.scheme != "https" or parsed.hostname != "www.bilibili.com" or f"/{item['video_id']}/" not in parsed.path:
            raise ValueError(f"Invalid source URL for {name}")
        metadata = json.loads((library / item["metadata"]).read_text(encoding="utf-8"))
        if metadata.get("source") != source or metadata.get("video_id") != item["video_id"]:
            raise ValueError(f"Source metadata differs from index: {name}")
        date = metadata["published_at"][:10]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            raise ValueError(f"Invalid publication date: {name}")
        primary_path = source_file(library, item["primary_markdown"])
        full_path = source_file(library, item["transcript_markdown"])
        base = f"transcript-{name}"
        has_guide = primary_path != full_path
        primary, primary_text = entry_for(item, base, primary_path, date, guide=has_guide, hidden=has_guide)
        notes.append(primary)
        files[CONTENT / f"{base}.md"] = primary_text
        if has_guide:
            full_slug = f"{base}-full"
            full, full_text = entry_for(item, full_slug, full_path, date)
            primary["transcript_slug"] = full_slug
            full["guide_slug"] = base
            notes.append(full)
            files[CONTENT / f"{full_slug}.md"] = full_text

    # Validate all entries before changing the public site. A removed library entry
    # must also disappear here, rather than leaving its old public copy online.
    for old in CONTENT.glob("transcript-*.md"):
        if old not in files:
            old.unlink()
    for path, text in files.items():
        path.write_text(text, encoding="utf-8")
    INDEX.write_text(json.dumps(notes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(seen)} videos, {len(files)} Markdown pages")


if __name__ == "__main__":
    main()
