#!/usr/bin/env bash
set -euo pipefail

export MSYS_NO_PATHCONV=1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
# eu-central-1 locally: LocalStack Function URLs do not route me-* regions (see src/config.ts)
export AWS_DEFAULT_REGION=eu-central-1 AWS_ENDPOINT_URL=http://localhost:4566 AWS_PAGER=""
OUT=/dev/null; [ "${OS:-}" = Windows_NT ] && OUT=NUL
case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; *) ARCH=x86_64 ;; esac
ROLE=arn:aws:iam::000000000000:role/lambda-role
SECRET=${WEBHOOK_SECRET:-whsec_demo}

rm -rf dist
for fn in webhook worker create-order; do
  mkdir -p "dist/$fn"
  npx esbuild "src/$fn.ts" --bundle --minify --platform=node --target=node22 \
    --outfile="dist/$fn/index.js" --log-level=warning
  (cd "dist/$fn" && zip -qj function.zip index.js)
done

echo "== tables"
for t in "processed-events eventId" "orders orderId"; do
  set -- $t
  aws dynamodb delete-table --table-name "$1" >"$OUT" 2>&1 || true
  aws dynamodb create-table --table-name "$1" \
    --attribute-definitions "AttributeName=$2,AttributeType=S" \
    --key-schema "AttributeName=$2,KeyType=HASH" \
    --billing-mode PAY_PER_REQUEST --query TableDescription.TableName --output text
done
aws dynamodb put-item --table-name orders \
  --item '{"orderId":{"S":"ord_1"},"status":{"S":"pending"},"amount":{"N":"4999"}}'

echo "== queues"
aws sqs delete-queue --queue-url "$(aws sqs get-queue-url --queue-name payments --query QueueUrl --output text 2>"$OUT")" 2>"$OUT" || true
aws sqs delete-queue --queue-url "$(aws sqs get-queue-url --queue-name payments-dlq --query QueueUrl --output text 2>"$OUT")" 2>"$OUT" || true
DLQ_URL=$(aws sqs create-queue --queue-name payments-dlq --query QueueUrl --output text)
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)
cat > dist/queue-attrs.json <<EOF
{"VisibilityTimeout":"30","RedrivePolicy":"{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"3\"}"}
EOF
QUEUE_URL=$(aws sqs create-queue --queue-name payments --attributes file://dist/queue-attrs.json --query QueueUrl --output text)
QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)
echo "$QUEUE_URL"
echo "$DLQ_URL"

echo "== functions"
for uuid in $(aws lambda list-event-source-mappings --function-name worker-fn --query 'EventSourceMappings[].UUID' --output text 2>"$OUT" || true); do
  aws lambda delete-event-source-mapping --uuid "$uuid" >"$OUT" 2>&1 || true
done
aws lambda delete-function --function-name webhook-fn >"$OUT" 2>&1 || true
aws lambda delete-function --function-name worker-fn >"$OUT" 2>&1 || true
aws lambda delete-function --function-name create-order-fn >"$OUT" 2>&1 || true
aws logs delete-log-group --log-group-name /aws/lambda/worker-fn >"$OUT" 2>&1 || true
aws lambda create-function --function-name webhook-fn \
  --runtime nodejs22.x --architectures "$ARCH" --memory-size 256 --timeout 10 \
  --handler index.handler --zip-file fileb://dist/webhook/function.zip --role "$ROLE" \
  --environment "Variables={WEBHOOK_SECRET=$SECRET,QUEUE_URL=$QUEUE_URL}" \
  --query State --output text
aws lambda create-function --function-name worker-fn \
  --runtime nodejs22.x --architectures "$ARCH" --memory-size 256 --timeout 20 \
  --handler index.handler --zip-file fileb://dist/worker/function.zip --role "$ROLE" \
  --environment "Variables={EVENTS_TABLE=processed-events,ORDERS_TABLE=orders,SIMULATE_BUG=true}" \
  --query State --output text
aws lambda create-function --function-name create-order-fn \
  --runtime nodejs22.x --architectures "$ARCH" --memory-size 256 --timeout 10 \
  --handler index.handler --zip-file fileb://dist/create-order/function.zip --role "$ROLE" \
  --environment "Variables={ORDERS_TABLE=orders}" \
  --query State --output text
aws lambda wait function-active-v2 --function-name webhook-fn
aws lambda wait function-active-v2 --function-name create-order-fn
aws lambda wait function-active-v2 --function-name worker-fn

echo "== SQS trigger for worker (partial batch responses on)"
aws lambda create-event-source-mapping --function-name worker-fn \
  --event-source-arn "$QUEUE_ARN" --batch-size 10 \
  --function-response-types ReportBatchItemFailures --query State --output text

echo "== DLQ alarm"
aws cloudwatch put-metric-alarm --alarm-name payments-dlq-not-empty \
    --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible \
    --dimensions Name=QueueName,Value=payments-dlq \
    --statistic Maximum --period 60 --evaluation-periods 1 \
    --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching

echo "== Function URLs (public HTTP endpoints, no API Gateway)"
for fn in create-order-fn webhook-fn; do
  aws lambda create-function-url-config --function-name "$fn" --auth-type NONE \
    --query FunctionUrl --output text
done
ORDER_URL=$(aws lambda get-function-url-config --function-name create-order-fn --query FunctionUrl --output text)
WEBHOOK_URL=$(aws lambda get-function-url-config --function-name webhook-fn --query FunctionUrl --output text)
printf 'ORDER_URL=%s\nWEBHOOK_URL=%s\n' "$ORDER_URL" "$WEBHOOK_URL" > dist/urls.env
echo "Saved to dist/urls.env"
