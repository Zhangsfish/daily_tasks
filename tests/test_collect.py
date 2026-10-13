import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest

from scripts import collect


NOW = datetime(2026, 10, 13, 0, 0, tzinfo=timezone.utc)


def story(section, source, title, url, offset=0):
    return collect.Story(section, source, title, url, NOW - timedelta(hours=offset), (url.split("/")[2],))


class CollectorTests(unittest.TestCase):
    def test_only_https_approved_hosts(self):
        self.assertTrue(collect.host_allowed("https://news.bbc.com/article", ("bbc.com",)))
        self.assertFalse(collect.host_allowed("http://bbc.com/article", ("bbc.com",)))
        self.assertFalse(collect.host_allowed("https://bbc.com.evil.test/article", ("bbc.com",)))

    def test_cross_source_corroboration_and_dedup(self):
        first = story("global", "BBC", "World leaders agree landmark climate finance deal", "https://bbc.com/one")
        second = story("global", "Guardian", "World leaders agree landmark climate finance deal", "https://theguardian.com/two", 2)
        self.assertTrue(collect.corroborates(first, second))
        self.assertFalse(collect.corroborates(first, first))
        unrelated = story("global", "Guardian", "Scientists find new ocean species off coast", "https://theguardian.com/three")
        self.assertFalse(collect.corroborates(first, unrelated))

    def test_future_and_undated_feed_entries_are_rejected(self):
        xml = b"<rss><channel><item><title>Example event</title><link>https://bbc.com/one</link><pubDate>Tue, 13 Oct 2026 00:01:00 GMT</pubDate></item><item><title>No date</title><link>https://bbc.com/two</link></item></channel></rss>"
        self.assertEqual(collect.parse_feed(xml, "global", "BBC", ("bbc.com",), NOW), [])

    def test_failed_verification_leaves_existing_snapshot_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            (root / "data/latest.json").write_text('{"date":"old"}\n', encoding="utf-8")
            bad = {"date": "2026-10-13", "sections": {"global": [], "ai": []}}
            with self.assertRaises(ValueError):
                collect.publish(bad, root)
            self.assertEqual((root / "data/latest.json").read_text(encoding="utf-8"), '{"date":"old"}\n')
            self.assertFalse((root / "archive").exists())

    def test_valid_snapshot_writes_latest_and_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            good = {"date": "2026-10-13", "generated_at": NOW.isoformat(), "sections": {"global": [{"title": "A"}], "ai": [{"title": "B"}]}}
            collect.publish(good, root)
            self.assertEqual(json.loads((root / "data/latest.json").read_text(encoding="utf-8")), good)
            self.assertEqual(json.loads((root / "archive/index.json").read_text(encoding="utf-8")), ["2026-10-13"])
            collect.publish(good, root)
            self.assertEqual(json.loads((root / "archive/index.json").read_text(encoding="utf-8")), ["2026-10-13"])


if __name__ == "__main__":
    unittest.main()
