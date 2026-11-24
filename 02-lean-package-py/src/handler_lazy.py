import coldstart
import json
import time

coldstart.mark_init_done()


def lambda_handler(event, context):
    start = time.perf_counter()

    if event.get("report"):
        import numpy
        import pandas

        total = int(numpy.arange(1000).sum())
        rows = len(pandas.DataFrame({"n": [1, 2, 3]}))

        body = {"total": total, "rows": rows}
    else:
        body = {"status": "ok"}

    cold = coldstart.take_cold()
    handler_ms = (time.perf_counter() - start) * 1000

    print(
        json.dumps(
            {
                "msg": "request_done",
                "coldStart": cold,
                "initMs": round(coldstart.init_ms(), 2) if cold else 0,
                "handlerMs": round(handler_ms, 2),
            }
        )
    )
    return {"statusCode": 200, "body": json.dumps(body)}
