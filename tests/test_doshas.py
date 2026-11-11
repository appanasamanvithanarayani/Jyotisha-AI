from datetime import date

import pytest

from jyotisha_ai.doshas import kuja_dosha, saturn_transits


def planets(mars_rashi: int, moon_rashi: int, lagna_rashi: int, mars_dignity=None) -> dict:
    house = lambda rashi: (rashi - lagna_rashi) % 12 + 1
    return {
        "Mars": {"rashi_index": mars_rashi, "whole_sign_bhava": house(mars_rashi), "dignity": mars_dignity},
        "Moon": {"rashi_index": moon_rashi, "whole_sign_bhava": house(moon_rashi), "dignity": None},
    }


def test_kuja_dosha_counts_from_lagna_and_from_moon():
    result = kuja_dosha(planets(mars_rashi=7, moon_rashi=1, lagna_rashi=1))      # Mars in the 7th from both
    assert result["present"] and result["from_lagna"] and result["from_moon"]
    assert result["house_from_lagna"] == 7 and result["house_from_moon"] == 7 and not result["reduced"]
    result = kuja_dosha(planets(mars_rashi=3, moon_rashi=1, lagna_rashi=1))      # 3rd from both: no dosha
    assert not result["present"] and not result["from_lagna"] and not result["from_moon"]
    result = kuja_dosha(planets(mars_rashi=4, moon_rashi=12, lagna_rashi=5))     # 12th from Lagna, 5th from Moon
    assert result["present"] and result["from_lagna"] and not result["from_moon"]
    assert kuja_dosha(planets(mars_rashi=1, moon_rashi=1, lagna_rashi=1, mars_dignity="own"))["reduced"]


def test_sade_sati_matches_published_saturn_transits():
    # Saturn was in sidereal Pisces in November 2026: Sade Sati phase 3 for Aquarius, 2 for Pisces, 1 for Aries.
    as_of = date(2026, 11, 11)
    aquarius, pisces, aries = (saturn_transits(index, as_of) for index in (11, 12, 1))
    assert aquarius["saturn_rashi_index"] == 12
    assert (aquarius["sade_sati"]["phase"], pisces["sade_sati"]["phase"], aries["sade_sati"]["phase"]) == (3, 2, 1)
    assert aquarius["sade_sati"]["current"] == {"start": "2020-01", "end": "2028-02"}   # Jan 2020 to Feb 2028
    capricorn = saturn_transits(10, as_of)
    assert not capricorn["sade_sati"]["active"] and capricorn["sade_sati"]["phase"] is None
    assert capricorn["sade_sati"]["next"]["start"].startswith("2046")
    # Saturn in the 8th from a Leo Moon (Pisces) is Ashtama Shani; in the 4th from a Sagittarius Moon, Ardhashtama.
    assert saturn_transits(5, as_of)["ashtama_shani"]["active"]
    assert saturn_transits(9, as_of)["ardhashtama_shani"]["active"]


def test_saturn_transits_rejects_bad_moon_sign():
    with pytest.raises(ValueError):
        saturn_transits(0, date(2026, 1, 1))
