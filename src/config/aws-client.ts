import { IAMClient } from '@aws-sdk/client-iam';
import { SSMClient } from '@aws-sdk/client-ssm';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SNSClient } from '@aws-sdk/client-sns';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import { env } from './env';

const localConfig = {
  endpoint: env.awsEndpoint,
  region: env.awsRegion,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
};

function buildConfig(extra: Record<string, unknown> = {}): typeof localConfig & Record<string, unknown> {
  if (env.nodeEnv === 'local') {
    return { ...localConfig, ...extra };
  }
  return extra as typeof localConfig & Record<string, unknown>;
}

export const iamClient = new IAMClient(buildConfig());
export const ssmClient = new SSMClient(buildConfig());
export const sqsClient = new SQSClient(buildConfig());
export const snsClient = new SNSClient(buildConfig());
export const stsClient = new STSClient(buildConfig());

// forcePathStyle is mandatory for S3 on LocalStack to avoid virtual-hosted-style URLs
export const s3Client = new S3Client(buildConfig({ forcePathStyle: true }));
