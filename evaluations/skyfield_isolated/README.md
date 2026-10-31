# Isolated Skyfield evaluation — Phase 2A

This is project-owned preparation, not a chart engine. Nothing here imports Skyfield, acquires data, or changes `jyotisha_ai`. The [backend audit](../ASTRONOMY_BACKEND_LICENSE_AND_ACCURACY_AUDIT.md) identifies NAIF `de440s.bsp` as a **candidate**, not an approved local source. No kernel or dependency may be acquired on the strength of this README.

The linked [AI-Powered Astrology App](https://github.com/amarskdev/AI-Powered-Astrology-App) was inspected for its high-level separation of Kundli, Dasha, Panchang and NLP concerns. Its README describes pretrained BART/Hugging Face use and restricts reuse. No code, architecture-specific implementation, model, or dependency was copied from it. This project retains its own Python CLI and research-first workflow.

## Boundary and future flow

1. A project rights reviewer must approve the **exact** official kernel URL and terms in a signed/dated record. Separately approve any timescale, leap-second or Earth-orientation data. Keep those files and approval documents outside Git.
2. In a future explicitly approved phase, create a separate environment under this directory, pin Skyfield 1.55 and all resolved dependencies/artifact hashes, and keep network access disabled. Do not use Skyfield's `load()` convenience downloader. No environment is created in Phase 2A.
3. A local manifest conforming to `kernel_manifest.schema.json` must identify one file, its origin, retrieval UTC timestamp, exact byte size, SHA-256, publisher checksum, coverage, rights review and approval. `kernel_manifest.template.json` is intentionally incomplete and **must not pass** validation. `offline_gate.py` checks only metadata, local bytes and a conservative approved UTC interval; it never opens a kernel with Skyfield or grants legal rights.
4. A future loader must call the gate first, open the exact verified absolute local file with a no-network file API, check loaded path/identity and coverage, and raise on **any** missing dependency, body, data file, warning, alternate backend, changed checksum, or unsupported time. No fallback, partial chart, approximate calculation or default position is allowed. The loader is deliberately not implemented yet.
5. Astronomical positions require independent benchmark cases before any Jyotisha rules or chart outputs. See `REFERENCE_VALIDATION_PLAN.md`. Keep astronomy results, tradition review, training data and model evaluation distinct.

**Stop conditions:** absent or incomplete approval; unknown source/terms; missing, symlinked, unreadable or mismatched kernel; unreviewed auxiliary time data; date outside the conservatively approved UTC interval; attempted URL/network access; inability to prove actual loaded backend; insufficient independent reference; or any unexpected calculation warning. On stop, return an error and **no chart**.

The kernel directory, local manifests and isolated virtual environments are Git-ignored. Do not put birth details, third-party source, raw books or candidate training datasets in this directory. The existing untracked `data/review/` content is unrelated and untouched.

Non-astronomical gate tests (synthetic bytes only): `\.venv\Scripts\python.exe -m pytest evaluations/skyfield_isolated/tests -q`. These tests do **not** validate Skyfield or any astronomical result.
