import asyncio
import pickle
import time

import pytest

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.render_service.worker import WorkerTimeout, run_in_worker

from ..data_prep.conftest import fixture_files, load_fixture, sample

ASSETS = {}
QUOTE_PARAMS = {"quoteId": "Q-1", "docDate": "2026-11-14"}


def test_definition_pickles():  # needed for spawn (Windows dev machines)
    definition = load_fixture("quotation")
    assert pickle.loads(pickle.dumps(definition)).report == definition.report


async def test_worker_gives_the_same_result_as_calling_directly():
    from jester_api.report_definition import AssetInfo

    definition, files = load_fixture("quotation"), fixture_files("quotation")
    assets = {"logo.png": AssetInfo("image/png", "ab" * 32)}
    result = await run_in_worker(
        definition, files, assets, QUOTE_PARAMS, sample("quotation"), {}, timeout_s=30
    )
    direct = bind(
        definition, files, assets, prepare(definition, QUOTE_PARAMS, sample("quotation"), {}).prepared
    )
    assert result.problems == [] and result.bound == direct.bound


async def test_input_problems_come_back_without_a_document():
    definition, files = load_fixture("quotation"), fixture_files("quotation")
    result = await run_in_worker(definition, files, {}, {}, sample("quotation"), {}, timeout_s=30)
    assert result.bound is None and {p.code for p in result.problems} == {"PARAM_REQUIRED"}


async def test_endless_template_is_killed_and_the_loop_keeps_running():
    files = fixture_files("quotation")
    files["template.html"] = (
        "{% for i in range(100000) %}{% for j in range(100000) %}{% endfor %}{% endfor %}"
    )
    from jester_api.report_definition import DefinitionInput, load_definition

    loaded = load_definition(DefinitionInput(files, {}, frozenset({"TH Sarabun New"})))
    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.05)
            ticks += 1

    task = asyncio.create_task(ticker())
    start = time.monotonic()
    with pytest.raises(WorkerTimeout):
        await run_in_worker(loaded.definition, files, {}, QUOTE_PARAMS, sample("quotation"), {}, timeout_s=2)
    elapsed = time.monotonic() - start
    task.cancel()
    assert elapsed < 8  # killed, not left to finish (it would take hours)
    assert ticks >= 10  # the event loop kept running while we waited
