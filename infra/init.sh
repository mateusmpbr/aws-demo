#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="us-east-1"
ACCOUNT_ID="000000000000"  # LocalStack always uses this fixed account ID

AWS="aws --endpoint-url $ENDPOINT --region $REGION"

echo "=== Initializing LocalStack resources ==="
echo ""

# ── Wait for LocalStack to be ready ─────────────────────────────────────────
echo "Waiting for LocalStack..."
until curl -sf "${ENDPOINT}/_localstack/health" | grep -q '"s3"' 2>/dev/null; do
  echo "  LocalStack not ready yet, retrying in 2s..."
  sleep 2
done
echo "LocalStack is ready."
echo ""

# ── SQS: Create DLQ first (required before main queue references it) ─────────
echo "[SQS] Creating DLQ: demo-dlq"
DLQ_URL=$($AWS sqs create-queue \
  --queue-name demo-dlq \
  --query 'QueueUrl' --output text 2>/dev/null || \
  $AWS sqs get-queue-url --queue-name demo-dlq --query 'QueueUrl' --output text)
echo "      DLQ URL: $DLQ_URL"

DLQ_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:demo-dlq"

# ── SQS: Create main queue, then set redrive policy separately (idempotent) ───
echo "[SQS] Creating main queue: demo-queue"
QUEUE_URL=$($AWS sqs create-queue \
  --queue-name demo-queue \
  --query 'QueueUrl' --output text 2>/dev/null || \
  $AWS sqs get-queue-url --queue-name demo-queue --query 'QueueUrl' --output text)
echo "      Queue URL: $QUEUE_URL"

# set-queue-attributes always runs — ensures redrive policy is correct even on re-runs
# Mix single/double quotes so backslashes survive shell expansion (single-quoted segments are literal)
echo "      Setting redrive policy: maxReceiveCount=3 → demo-dlq"
$AWS sqs set-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attributes '{"VisibilityTimeout":"30","RedrivePolicy":"{\"deadLetterTargetArn\":\"'"$DLQ_ARN"'\",\"maxReceiveCount\":\"3\"}"}' \
  > /dev/null
echo ""

# ── SNS: Create topic ────────────────────────────────────────────────────────
# create-topic is idempotent — safe to run multiple times
echo "[SNS] Creating topic: demo-topic"
TOPIC_ARN=$($AWS sns create-topic \
  --name demo-topic \
  --query 'TopicArn' --output text)
echo "      Topic ARN: $TOPIC_ARN"
echo ""

# ── S3: Create bucket ────────────────────────────────────────────────────────
echo "[S3]  Creating bucket: demo-bucket"
$AWS s3api create-bucket --bucket demo-bucket --output text > /dev/null 2>/dev/null && \
  echo "      Created bucket: demo-bucket" || \
  echo "      Bucket demo-bucket already exists"
echo ""

# ── SSM: Create parameters ──────────────────────────────────────────────────
# NOTE: SecureString requires LocalStack Pro with LOCALSTACK_AUTH_TOKEN.
#       On LocalStack Community, the put succeeds but get --with-decryption
#       returns KMS-encrypted ciphertext instead of the plaintext value.
echo "[SSM] Creating String parameter: /demo/string-param"
$AWS ssm put-parameter \
  --name "/demo/string-param" \
  --value "hello-from-ssm" \
  --type String \
  --overwrite \
  --query 'Version' --output text | xargs -I{} echo "      Version: {}"

echo "[SSM] Creating SecureString parameter: /demo/secure-param"
$AWS ssm put-parameter \
  --name "/demo/secure-param" \
  --value "super-secret-value" \
  --type SecureString \
  --overwrite \
  --query 'Version' --output text | xargs -I{} echo "      Version: {}"
echo ""

# ── IAM: Create policy ──────────────────────────────────────────────────────
echo "[IAM] Creating policy: demo-policy"
POLICY_DOCUMENT='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:*", "sqs:*", "sns:*", "s3:*", "sts:AssumeRole"],
    "Resource": "*"
  }]
}'

POLICY_ARN=$($AWS iam create-policy \
  --policy-name demo-policy \
  --policy-document "$POLICY_DOCUMENT" \
  --query 'Policy.Arn' --output text 2>/dev/null || \
  $AWS iam list-policies \
    --query "Policies[?PolicyName=='demo-policy'].Arn" \
    --output text)
echo "      Policy ARN: $POLICY_ARN"

# ── IAM: Create role with trust policy ──────────────────────────────────────
echo "[IAM] Creating role: demo-role"
TRUST_POLICY="{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Effect\": \"Allow\",
    \"Principal\": {\"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\"},
    \"Action\": \"sts:AssumeRole\"
  }]
}"

$AWS iam create-role \
  --role-name demo-role \
  --assume-role-policy-document "$TRUST_POLICY" \
  --query 'Role.Arn' --output text 2>/dev/null | xargs -I{} echo "      Role ARN: {}" || \
  echo "      Role demo-role already exists"

# ── IAM: Attach policy to role ───────────────────────────────────────────────
echo "[IAM] Attaching demo-policy to demo-role"
$AWS iam attach-role-policy \
  --role-name demo-role \
  --policy-arn "$POLICY_ARN" 2>/dev/null && \
  echo "      Policy attached" || \
  echo "      Policy already attached"
echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
echo "=== Initialization complete ==="
echo ""
echo "Resources:"
echo "  SQS Queue:  $QUEUE_URL"
echo "  SQS DLQ:    $DLQ_URL"
echo "  SNS Topic:  $TOPIC_ARN"
echo "  S3 Bucket:  s3://demo-bucket"
echo "  SSM Params: /demo/string-param (String), /demo/secure-param (SecureString)"
echo "  IAM Policy: $POLICY_ARN"
echo "  IAM Role:   arn:aws:iam::${ACCOUNT_ID}:role/demo-role"
echo ""
echo "Run demos with: npm run demo:<iam|ssm|sqs|sns|s3>"
