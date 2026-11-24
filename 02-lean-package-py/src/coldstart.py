import time

_t0 = time.perf_counter()
_init_ms = None
_cold = True


def mark_init_done():
    global _init_ms
    # It computes how many milliseconds have passed since the stopwatch started
    _init_ms = (time.perf_counter() - _t0) * 1000
    
def init_ms():
    return _init_ms

def take_cold():
    global _cold
    was_cold = _cold
    _cold = False
    return was_cold


