#!/usr/bin/env bash
set -euo pipefail

export MSYS_NO_PATHCONV=1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=me-central-1 AWS_ENDPOINT_URL=http://localhost:4566 AWS_PAGER=""
OUT=/dev/null; [ "${OS:-}" = Windows_NT ] && OUT=NUL
FN=${1:-lean-py}
CONCURRENCY=${2:-20}
TOTAL=${3:-100}

echo "Sending $TOTAL requests, $CONCURRENCY at a time, to $FN"
seq "$TOTAL" | xargs -P "$CONCURRENCY" -I{} aws lambda invoke --function-name "$FN" \
  --cli-binary-format raw-in-base64-out --payload '{}' \
  "$OUT" --query StatusCode --output text | sort | uniq -c
