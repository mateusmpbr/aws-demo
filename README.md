# aws-demo

Node.js + TypeScript sandbox for testing AWS service behavior against [LocalStack](https://localstack.cloud).

Covers: **IAM**, **SSM Parameter Store**, **SQS** (with DLQ), **SNS** (→ SQS delivery), **S3**.

---

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5 (strict mode) |
| AWS SDK | AWS SDK v3 (`@aws-sdk/*`) |
| Local AWS | LocalStack via Docker Compose |
| Package manager | npm |
| Script runner | `tsx` (esbuild-backed, no separate compile step) |

---

## Project structure

```
/src
  /config
    env.ts          # loads .env.local, exports typed env object
    aws-client.ts   # singleton SDK clients (endpoint → localhost:4566)
  /services
    /iam            # createRole, createPolicy, assumeRole
    /ssm            # write/read String and SecureString parameters
    /sqs            # send, long-poll consumer loop, DLQ via redrive
    /sns            # createTopic, subscribeQueue, publish, verifyDelivery
    /s3             # createBucket, upload, download, list, delete
  /scripts
    demo-iam.ts     # npm run demo:iam
    demo-ssm.ts     # npm run demo:ssm
    demo-sqs.ts     # npm run demo:sqs
    demo-sns.ts     # npm run demo:sns
    demo-s3.ts      # npm run demo:s3
/infra
  docker-compose.yml
  init.sh           # creates all AWS resources via aws CLI
.env.local          # runtime config (gitignored)
```

---

## Prerequisites

- **Node.js 20+** and **npm**
- **Docker** + **Docker Compose**
- **AWS CLI** (`aws`) installed and callable
- *(Optional)* `LOCALSTACK_AUTH_TOKEN` — required for SSM SecureString decryption (LocalStack Pro feature)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

The file `.env.local` is pre-populated with sensible defaults for LocalStack. Edit it only if you need to change resource names.

```bash
# Optional: add your LocalStack Pro token for SecureString support
echo "LOCALSTACK_AUTH_TOKEN=your-token-here" >> .env.local
```

### 3. Start LocalStack

```bash
npm run infra:up
```

Wait for LocalStack to become healthy (~10–20 seconds):

```bash
curl http://localhost:4566/_localstack/health
```

All listed services (`iam`, `sts`, `ssm`, `sqs`, `sns`, `s3`) should show `"running"`.

### 4. Create AWS resources

```bash
npm run infra:init
```

This creates (idempotent — safe to re-run):
- SQS `demo-dlq` + `demo-queue` with redrive policy (`maxReceiveCount=3`)
- SNS topic `demo-topic`
- S3 bucket `demo-bucket`
- SSM parameters `/demo/string-param` and `/demo/secure-param`
- IAM policy `demo-policy` and role `demo-role`

### 5. (Optional) Type-check

```bash
npm run build
```

Must exit with zero errors.

---

## Running the demos

Run in this order (SQS queue must exist before the SNS demo):

```bash
npm run demo:iam
npm run demo:ssm
npm run demo:sqs
npm run demo:sns
npm run demo:s3
```

---

## Expected output

### `npm run demo:iam`

```
=== IAM Demo ===

Account ID:  000000000000
Policy ARN:  arn:aws:iam::000000000000:policy/demo-policy
Role ARN:    arn:aws:iam::000000000000:role/demo-role

Assuming role...
Temporary Access Key: test
Session Token:        FwoGZXIvYXdzEN...
Expires:              2026-06-13T01:00:00.000Z

IAM demo complete.
```

### `npm run demo:ssm`

```
=== SSM Parameter Store Demo ===

Written String:  /demo/string-param = "hello-from-ssm"
Read String:     /demo/string-param = "hello-from-ssm" [String]
Round-trip OK:   true

Written Secure:  /demo/secure-param = (value encrypted at rest)
Read Secure:     /demo/secure-param = "super-secret-value" [SecureString]
Decryption OK:   true

SSM demo complete.
```

> **Note:** `Decryption OK: true` requires LocalStack Pro. On LocalStack Community, the decrypted value will differ (KMS ciphertext is returned instead).

### `npm run demo:sqs`

```
=== SQS Demo ===

Queue URL: http://localhost:4566/000000000000/demo-queue
DLQ URL:   http://localhost:4566/000000000000/demo-dlq

Sent message 1: <uuid>
Sent message 2: <uuid>
Sent message 3: <uuid>

Starting poller (WaitTimeSeconds=20, stops after 3 successful messages)...

  Received: index=1  receiveCount=1  msgId=<uuid>
  Processed OK: index=1
  Received: index=2  receiveCount=1  msgId=<uuid>
  [poller] Message <uuid> failed (attempt 1/3): Simulated processing failure
  Received: index=2  receiveCount=2  msgId=<uuid>
  Processed OK: index=2
  Received: index=3  receiveCount=1  msgId=<uuid>
  Processed OK: index=3

SQS demo complete.
```

**How the DLQ works:** The queue has `maxReceiveCount=3`. If `onMessage` throws, the poller resets `VisibilityTimeout=0` (immediate requeue). After 3 failed receives, SQS automatically moves the message to `demo-dlq`.

### `npm run demo:sns`

```
=== SNS Demo ===

Topic ARN: arn:aws:sns:us-east-1:000000000000:demo-topic
Queue ARN: arn:aws:sqs:us-east-1:000000000000:demo-queue
Subscription ARN: arn:aws:sns:us-east-1:000000000000:demo-topic:<uuid>

Published message ID: <uuid>
Verifying delivery in SQS (polling up to 15 seconds)...
Delivered body:  "Hello from SNS! Timestamp: 2026-06-12T23:00:00.000Z"
Payload matches: true

SNS demo complete.
```

> The service sets an `sqs:SendMessage` resource policy on the queue before subscribing — required for SNS to deliver messages.

### `npm run demo:s3`

```
=== S3 Demo ===

Created bucket: demo-bucket
Uploaded: demo-upload.txt (ETag: d41d8cd98f00b204e9800998ecf8427e)

Listed 1 object(s):
  - demo-upload.txt (67 bytes, modified 2026-06-12T23:00:00.000Z)

Downloaded content:
Demo file created at 2026-06-12T23:00:00.000Z
Hello from LocalStack S3!

Deleted: demo-upload.txt
Objects after delete: 0

S3 demo complete.
```

---

## Manual verification commands

```bash
# Check LocalStack health
curl -s http://localhost:4566/_localstack/health | python3 -m json.tool

# Inspect DLQ message count
aws --endpoint-url http://localhost:4566 --region us-east-1 \
  sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/demo-dlq \
  --attribute-names ApproximateNumberOfMessages

# List active SNS subscriptions
aws --endpoint-url http://localhost:4566 --region us-east-1 \
  sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:000000000000:demo-topic

# Read SSM SecureString (LocalStack Pro only)
aws --endpoint-url http://localhost:4566 --region us-east-1 \
  ssm get-parameter --name /demo/secure-param --with-decryption \
  --query 'Parameter.Value' --output text

# List S3 bucket contents
aws --endpoint-url http://localhost:4566 --region us-east-1 \
  s3 ls s3://demo-bucket/
```

---

## Stopping LocalStack

```bash
npm run infra:down
```

---

## Key technical notes

| Topic | Detail |
|-------|--------|
| S3 path-style | `forcePathStyle: true` is required on the S3 client. Without it, the SDK generates `bucket.localhost:4566` virtual-hosted URLs that don't resolve. |
| SNS → SQS | SNS requires `sqs:SendMessage` on the target queue's resource policy. The demo sets this before subscribing. |
| SQS DLQ | Redrive is managed by SQS (`maxReceiveCount=3`). The poller resets `VisibilityTimeout=0` on failure to accelerate retries; SQS handles the move to DLQ. |
| SecureString | Requires LocalStack Pro + `LOCALSTACK_AUTH_TOKEN`. On Community, put succeeds but get returns KMS ciphertext. |
| LocalStack account | Fixed as `000000000000` in all ARNs. |
| Credentials | Dummy `test/test` when `NODE_ENV=local`. The client factory switches to the standard SDK credential chain otherwise. |
