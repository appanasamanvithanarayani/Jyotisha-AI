"""Runtime chart gate tests; reference values remain limited synthetic checks."""

import pytest

from jyotisha_ai.chart_validation import ChartValidationError, validate_local_chart_runtime


def test_runtime_reference_gate_passes_with_pinned_dependencies():
    validate_local_chart_runtime()


def test_runtime_reference_gate_fails_on_wrong_package_version(monkeypatch):
    original = __import__("jyotisha_ai.chart_validation", fromlist=["version"]).version
    monkeypatch.setattr(
        "jyotisha_ai.chart_validation.version",
        lambda name: "0.0.0" if name == "pyerfa" else original(name),
    )
    with pytest.raises(ChartValidationError, match="pyerfa"):
        validate_local_chart_runtime()


def test_runtime_reference_gate_fails_on_wrong_calculation(monkeypatch):
    import jyotisha_ai.chart_validation as gate
    original = gate.calculate_chart
    def bad_chart(*args):
        chart = original(*args)
        chart["ascendant"]["sidereal_longitude"] += 1
        return chart
    monkeypatch.setattr(gate, "calculate_chart", bad_chart)
    with pytest.raises(ChartValidationError, match="ascendant"):
        validate_local_chart_runtime()
