#!/usr/bin/env bash
set -euo pipefail

export MSYS_NO_PATHCONV=1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=me-central-1 AWS_ENDPOINT_URL=http://localhost:4566 AWS_PAGER=""
OUT=/dev/null; [ "${OS:-}" = Windows_NT ] && OUT=NUL
case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; *) ARCH=x86_64 ;; esac
FN=${1:-lean-bundle}
MEMORY=${2:-256}

rm -rf dist
npm run build --silent
ls -l dist/index.js dist/function.zip | awk '{print $5, $9}'

aws lambda delete-function --function-name "$FN" 2>"$OUT" || true
aws logs delete-log-group --log-group-name "/aws/lambda/$FN" 2>"$OUT" || true
aws lambda create-function --function-name "$FN" \
  --runtime nodejs22.x --architectures "$ARCH" --memory-size "$MEMORY" --timeout 30 \
  --handler index.handler \
  --zip-file fileb://dist/function.zip \
  --role arn:aws:iam::000000000000:role/lambda-role --query State --output text
aws lambda wait function-active-v2 --function-name "$FN"

for i in 1 2 3; do
  aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
    --payload '{"rawPath":"/checkout"}' "$OUT" --query StatusCode --output text
done

sleep 2
aws logs filter-log-events --log-group-name "/aws/lambda/$FN" \
  --filter-pattern request_done --query 'events[].message' --output text
