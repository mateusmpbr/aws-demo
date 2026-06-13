import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  nodeEnv:        process.env['NODE_ENV'] ?? 'production',
  awsEndpoint:    requireEnv('AWS_ENDPOINT'),
  awsRegion:      requireEnv('AWS_REGION'),
  iamRoleName:    requireEnv('IAM_ROLE_NAME'),
  iamPolicyName:  requireEnv('IAM_POLICY_NAME'),
  ssmStringParam: requireEnv('SSM_STRING_PARAM'),
  ssmSecureParam: requireEnv('SSM_SECURE_PARAM'),
  ssmStringValue: requireEnv('SSM_STRING_VALUE'),
  ssmSecureValue: requireEnv('SSM_SECURE_VALUE'),
  sqsQueueName:   requireEnv('SQS_QUEUE_NAME'),
  sqsDlqName:     requireEnv('SQS_DLQ_NAME'),
  sqsMaxRetries:  parseInt(requireEnv('SQS_MAX_RETRIES'), 10),
  snsTopicName:   requireEnv('SNS_TOPIC_NAME'),
  s3BucketName:   requireEnv('S3_BUCKET_NAME'),
  s3ObjectKey:    requireEnv('S3_OBJECT_KEY'),
} as const;
