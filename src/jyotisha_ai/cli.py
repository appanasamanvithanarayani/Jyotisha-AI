"""Command-line entry points for project utilities."""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Sequence

from jyotisha_ai.health import format_report, run_health_checks
from jyotisha_ai.chart import calculate_chart
from jyotisha_ai.ingestion.manifest import ManifestError, load_manifest, record_processing_result
from jyotisha_ai.ingestion.pipeline import IngestionError, ingest, validate_corpus
from jyotisha_ai.knowledge.catalog import load_knowledge, schema_summary, search_records
from jyotisha_ai.knowledge.inventory import inventory_report
from jyotisha_ai.knowledge.graha_research import graha_report


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="jyotisha-ai")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("health", help="verify the Milestone 1 foundation")
    chart = subparsers.add_parser("chart", help="calculate an unreviewed birth-instant chart from explicit inputs")
    chart.add_argument("--datetime", required=True, help="ISO birth date/time with UTC offset, e.g. 2000-01-01T12:00:00+05:30")
    chart.add_argument("--latitude", required=True, type=float, help="degrees north")
    chart.add_argument("--longitude", required=True, type=float, help="degrees east")
    chart.add_argument("--ayanamsha-degrees", required=True, type=float, help="explicit numeric sidereal offset")
    chart.add_argument("--ayanamsha-id", required=True, help="provenance label for the supplied offset")
    web = subparsers.add_parser("serve", help="run the local-only experimental research app")
    web.add_argument("--port", type=int, default=8765, help="localhost port (default: 8765)")
    web.add_argument("--lan-ip", help="authenticated LAN access on this exact private IPv4 address until stopped")
    web.add_argument("--lan-minutes", type=int, help="optional LAN shutdown after 1..120 minutes; otherwise run until stopped")
    sources = subparsers.add_parser("sources", help="manage the local source catalog")
    sources_sub = sources.add_subparsers(dest="sources_command", required=True)
    sources_sub.add_parser("validate", help="validate data/manifests/sources.jsonl")
    ingestion = subparsers.add_parser("ingest", help="extract an authorized source")
    ingestion.add_argument("source_id")
    corpus = subparsers.add_parser("corpus", help="inspect generated passages")
    corpus_sub = corpus.add_subparsers(dest="corpus_command", required=True)
    corpus_sub.add_parser("validate", help="check generated corpus integrity")
    corpus_sub.add_parser("report", help="summarize generated corpus quality")
    knowledge = subparsers.add_parser("knowledge", help="inspect structured knowledge records")
    knowledge_sub = knowledge.add_subparsers(dest="knowledge_command", required=True)
    knowledge_sub.add_parser("schema", help="show knowledge schema and taxonomy scope")
    knowledge_sub.add_parser("validate", help="validate knowledge records and references")
    knowledge_sub.add_parser("report", help="summarize review and provenance quality")
    search = knowledge_sub.add_parser("search", help="literal Unicode search over knowledge records")
    search.add_argument("term")
    inventory = knowledge_sub.add_parser("inventory", help="inspect research-area inventory")
    inventory_sub = inventory.add_subparsers(dest="inventory_command", required=True)
    inventory_sub.add_parser("validate", help="validate inventory structure and links")
    inventory_sub.add_parser("report", help="summarize inventory coverage and status")
    grahas = knowledge_sub.add_parser("grahas", help="inspect the Graha research checklist")
    grahas_sub = grahas.add_subparsers(dest="grahas_command", required=True)
    grahas_sub.add_parser("validate", help="validate nine Graha research placeholders")
    grahas_sub.add_parser("report", help="summarize Graha research status")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the command-line interface and return a process exit code."""
    args = _parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO)

    if args.command == "health":
        report = run_health_checks(_project_root())
        print(format_report(report))
        return 0 if report.healthy else 1

    root = _project_root()
    try:
        if args.command == "serve":
            from jyotisha_ai.webapp import serve

            serve(args.port, lan_ip=args.lan_ip, lan_minutes=args.lan_minutes)
            return 0
        if args.command == "chart":
            report = calculate_chart(
                datetime.fromisoformat(args.datetime), args.latitude, args.longitude,
                args.ayanamsha_degrees, args.ayanamsha_id,
            )
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0
        if args.command == "sources":
            records, warnings = load_manifest(root / "data/manifests/sources.jsonl")
            print(json.dumps({"sources": len(records), "warnings": warnings, "errors": []}, ensure_ascii=False, indent=2))
            return 0
        if args.command == "ingest":
            manifest = root / "data/manifests/sources.jsonl"
            try:
                report = ingest(root, args.source_id)
            except IngestionError as exc:
                try:
                    record_processing_result(manifest, args.source_id, status="blocked" if "permission" in str(exc) else "failed", error=str(exc))
                except ManifestError:
                    pass
                raise
            record_processing_result(manifest, args.source_id, status="processed")
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0
        if args.command == "corpus":
            report = validate_corpus(root)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0 if not report["errors"] else 1
        if args.command == "knowledge":
            if args.knowledge_command == "grahas":
                report = graha_report(root)
                print(json.dumps(report, ensure_ascii=True, indent=2))
                return 0 if not report["errors"] else 1
            if args.knowledge_command == "inventory":
                report = inventory_report(root)
                print(json.dumps(report, ensure_ascii=True, indent=2))
                return 0 if not report["errors"] else 1
            if args.knowledge_command == "schema":
                print(json.dumps(schema_summary(root), ensure_ascii=True, indent=2))
                return 0
            records, report = load_knowledge(root)
            if args.knowledge_command in {"validate", "report"}:
                print(json.dumps(report, ensure_ascii=True, indent=2))
                return 0 if not report["errors"] else 1
            if report["errors"]:
                print(json.dumps(report, ensure_ascii=True, indent=2))
                return 1
            results = search_records(records, args.term)
            print(json.dumps({"term": args.term, "matches": len(results), "results": results}, ensure_ascii=True, indent=2))
            return 0
    except (ManifestError, IngestionError, OSError, ValueError) as exc:
        logging.error("%s", exc)
        return 1

    raise AssertionError(f"Unhandled command: {args.command}")
