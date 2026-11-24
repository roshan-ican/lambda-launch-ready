import importlib
import time

import coldstart


def fresh():
    return importlib.reload(coldstart)


def test_take_cold_is_true_once_then_false():
    m = fresh()
    assert m.take_cold() is True
    assert m.take_cold() is False


def test_init_ms_is_none_before_mark():
    m = fresh()
    assert m.init_ms() is None


def test_init_ms_measures_elapsed_time():
    m = fresh()
    time.sleep(0.1)
    m.mark_init_done()
    assert 90 <= m.init_ms() < 300
