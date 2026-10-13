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

    def test_newsletter_with_multiple_claims_is_rejected(self):
        xml = b"<rss><channel><item><title>Government spent millions on ads. And, agents raid a home</title><link>https://npr.org/2026/10/13/up-first-newsletter-story</link><pubDate>Tue, 13 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>"
        self.assertEqual(collect.parse_feed(xml, "global", "NPR", ("npr.org",), NOW), [])

    def test_global_section_excludes_routine_entertainment_and_local_accidents(self):
        self.assertFalse(collect.relevant_to_section("global", "Breaking Bad actor RJ Mitte dies aged 34"))
        self.assertFalse(collect.relevant_to_section("global", "One dead after rollercoaster incident"))
        self.assertTrue(collect.relevant_to_section("global", "Leaders agree on climate treaty"))
        self.assertTrue(collect.relevant_to_section("ai", "AI actor model released"))

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

    def test_full_collection_with_two_independent_sources_per_section(self):
        headline = "World leaders agree landmark climate finance deal"
        ai_headline = "Researchers release powerful open model for developers"

        def fake_fetch(url):
            section = next(kind for kind, feeds in collect.SOURCES.items() if any(feed == url for _, feed, _ in feeds))
            title = headline if section == "global" else ai_headline
            hosts = {"BBC News": "bbc.co.uk", "The Guardian": "theguardian.com", "NPR": "npr.org", "Al Jazeera": "aljazeera.com", "ABC News": "abcnews.go.com", "DW": "dw.com", "TechCrunch": "techcrunch.com", "The Verge": "theverge.com", "Ars Technica": "arstechnica.com"}
            source = next(name for feeds in collect.SOURCES.values() for name, feed, _ in feeds if feed == url)
            xml = f"<rss><channel><item><title>{title}</title><link>https://{hosts[source]}/article</link><pubDate>Mon, 12 Oct 2026 23:00:00 GMT</pubDate></item></channel></rss>"
            return xml.encode(), url, "application/rss+xml"

        result = collect.collect(NOW, fetch=fake_fetch, verify=lambda _: True)
        self.assertEqual(result["date"], "2026-10-13")
        self.assertGreaterEqual(len(result["sections"]["global"]), 1)
        self.assertGreaterEqual(len(result["sections"]["ai"]), 1)


if __name__ == "__main__":
    unittest.main()
