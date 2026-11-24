import coldstart

import json
import time
import boto3
import numpy
import pandas

s3 = boto3.client("s3", region_name="me-central-1")
dynamodb = boto3.client("dynamodb", region_name="me-central-1")
sqs = boto3.client("sqs", region_name="me-central-1")

coldstart.mark_init_done()


def lambda_handler(event, context):
    start = time.perf_counter()

    total = int(numpy.arange(1000).sum())
    rows = len(pandas.DataFrame({"n": [1, 2, 3]}))

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
    return {"statusCode": 200, "body": json.dumps({"total": total, "rows": rows})}
