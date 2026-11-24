#!/usr/bin/env bash
set -euo pipefail

export MSYS_NO_PATHCONV=1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=me-central-1 AWS_ENDPOINT_URL=http://localhost:4566 AWS_PAGER=""
OUT=/dev/null; [ "${OS:-}" = Windows_NT ] && OUT=NUL
FN=${1:-lean-py}
MEMORY=${2:-256}
MODULE=${3:-handler}
REQS=${4:-requirements.txt}

BUCKET=lean-py-artifacts

./build.sh "$REQS"
aws s3 mb "s3://$BUCKET" 2>"$OUT" || true
aws s3 cp dist/function.zip "s3://$BUCKET/$FN.zip" --only-show-errors
aws lambda delete-function --function-name "$FN" 2>"$OUT" || true
aws logs delete-log-group --log-group-name "/aws/lambda/$FN" 2>"$OUT" || true
aws lambda create-function --function-name "$FN" \
  --runtime python3.12 --architectures x86_64 --memory-size "$MEMORY" --timeout 30 \
  --handler "$MODULE.lambda_handler" \
  --code "S3Bucket=$BUCKET,S3Key=$FN.zip" \
  --role arn:aws:iam::000000000000:role/lambda-role --query State --output text
aws lambda wait function-active-v2 --function-name "$FN"
