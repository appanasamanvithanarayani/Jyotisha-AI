import pytest


@pytest.fixture(autouse=True)
def isolated_admin_data(tmp_path, monkeypatch):
    """Settings, audit log and counters never touch the real admin-data folder."""
    monkeypatch.setenv("JYOTISHA_DATA_DIR", str(tmp_path / "admin-data"))
