"""Every file the app page loads must be listed in pyproject.toml's package data, or the Docker image (pip install .)
leaves it out and the live site gets a 404 while the source checkout works. This happened once with art.js."""

import fnmatch
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "src" / "jyotisha_ai" / "web"
GENERATED = {"locales.js"}   # built by the server from locales/*.js, not a file of its own


def packaged() -> list[str]:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    return data["tool"]["setuptools"]["package-data"]["jyotisha_ai.web"]


def is_packaged(relative: str) -> bool:
    return any(fnmatch.fnmatch(relative, pattern) for pattern in packaged())


def test_every_script_stylesheet_and_icon_the_page_loads_is_packaged():
    page = (WEB / "birth.html").read_text(encoding="utf-8")
    referenced = set(re.findall(r'(?:src|href)="/([\w./-]+\.(?:js|css|png|webmanifest))"', page))
    missing = sorted(name for name in referenced - GENERATED if not is_packaged(name))
    assert not missing, f"add to [tool.setuptools.package-data] in pyproject.toml: {missing}"


def test_every_shell_file_the_service_worker_caches_is_packaged():
    shell = re.search(r"const SHELL = \[([^\]]*)\]", (WEB / "sw.js").read_text(encoding="utf-8")).group(1)
    files = [name.strip(" '\"/") for name in shell.split(",") if name.strip(" '\"/")]
    missing = sorted(name for name in files if name not in GENERATED and not is_packaged(name))
    assert not missing, f"add to [tool.setuptools.package-data] in pyproject.toml: {missing}"


def test_every_web_file_in_the_folder_is_packaged():
    loose = sorted(str(path.relative_to(WEB)) for path in WEB.rglob("*") if path.is_file() and path.suffix in (".js", ".css", ".html")
                   and not is_packaged(str(path.relative_to(WEB))))
    assert not loose, f"web files that would be missing from the Docker image: {loose}"
