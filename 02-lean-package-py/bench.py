import json
import statistics
import sys
import time

import boto3

fn = sys.argv[1]
runs = int(sys.argv[2]) if len(sys.argv) > 2 else 8
payload = sys.argv[3] if len(sys.argv) > 3 else "{}"

kwargs = dict(
    endpoint_url="http://localhost:4566",
    region_name="me-central-1",
    aws_access_key_id="test",
    aws_secret_access_key="test",
)
lam = boto3.client("lambda", **kwargs)
logs = boto3.client("logs", **kwargs)
group = f"/aws/lambda/{fn}"


def request_logs():
    try:
        events = logs.filter_log_events(logGroupName=group, filterPattern="request_done")["events"]
    except logs.exceptions.ResourceNotFoundException:
        return []
    parsed = []
    for e in events:
        msg = e["message"]
        if "request_done" in msg and "{" in msg:
            parsed.append(json.loads(msg[msg.index("{"):]))
    return parsed


colds = []
for i in range(runs):
    lam.update_function_configuration(FunctionName=fn, Environment={"Variables": {"RUN": str(i)}})
    lam.get_waiter("function_updated_v2").wait(FunctionName=fn)
    before = len(request_logs())
    lam.invoke(FunctionName=fn, Payload=payload.encode())
    after = request_logs()
    for _ in range(20):
        if len(after) > before:
            break
        time.sleep(0.5)
        after = request_logs()
    fresh = after[before:]
    cold = [l for l in fresh if l["coldStart"]]
    if cold:
        colds.append(cold[0]["initMs"] + cold[0]["handlerMs"])

print(f"{fn}: {len(colds)}/{runs} cold starts")
if colds:
    print(f"cold total ms  min {min(colds):.0f}  median {statistics.median(colds):.0f}  max {max(colds):.0f}")
