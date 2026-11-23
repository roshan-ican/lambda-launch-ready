#!/usr/bin/env bash
set -euo pipefail

export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=me-central-1 AWS_ENDPOINT_URL=http://localhost:4566 AWS_PAGER=""
FN=obs-status

rm -rf dist
npm run build
aws lambda delete-function --function-name "$FN" 2>/dev/null || true
aws logs delete-log-group --log-group-name "/aws/lambda/$FN" 2>/dev/null || true
aws lambda create-function --function-name "$FN" \
  --runtime nodejs22.x --architectures arm64 --handler index.handler \
  --zip-file fileb://dist/function.zip \
  --role arn:aws:iam::000000000000:role/lambda-role --query State --output text
aws lambda wait function-active-v2 --function-name "$FN"

for i in 1 2 3; do
  aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
    --payload '{"rawPath":"/status"}' /dev/null --query StatusCode --output text
done

sleep 2
aws logs filter-log-events --log-group-name "/aws/lambda/$FN" \
  --filter-pattern request_done --query 'events[].message' --output text
