import {
  CreatePolicyCommand,
  CreateRoleCommand,
  AttachRolePolicyCommand,
} from '@aws-sdk/client-iam';
import {
  GetCallerIdentityCommand,
  AssumeRoleCommand,
} from '@aws-sdk/client-sts';
import { iamClient, stsClient } from '../../config/aws-client';
import { env } from '../../config/env';

export interface IamSetupResult {
  roleArn: string;
  policyArn: string;
  accountId: string;
}

export interface AssumedRoleCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

async function getAccountId(): Promise<string> {
  const res = await stsClient.send(new GetCallerIdentityCommand({}));
  const account = res.Account;
  if (!account) throw new Error('GetCallerIdentity returned no Account');
  return account;
}

async function createDemoPolicy(accountId: string): Promise<string> {
  const policyDocument = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['ssm:*', 'sqs:*', 'sns:*', 's3:*', 'sts:AssumeRole'],
        Resource: '*',
      },
    ],
  });

  try {
    const res = await iamClient.send(
      new CreatePolicyCommand({
        PolicyName: env.iamPolicyName,
        PolicyDocument: policyDocument,
      })
    );
    const arn = res.Policy?.Arn;
    if (!arn) throw new Error('CreatePolicy returned no ARN');
    return arn;
  } catch (err: unknown) {
    if (isEntityAlreadyExists(err)) {
      return `arn:aws:iam::${accountId}:policy/${env.iamPolicyName}`;
    }
    throw err;
  }
}

async function createDemoRole(policyArn: string, accountId: string): Promise<string> {
  const trustPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: 'sts:AssumeRole',
      },
    ],
  });

  try {
    await iamClient.send(
      new CreateRoleCommand({
        RoleName: env.iamRoleName,
        AssumeRolePolicyDocument: trustPolicy,
      })
    );
  } catch (err: unknown) {
    if (!isEntityAlreadyExists(err)) throw err;
  }

  try {
    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: env.iamRoleName,
        PolicyArn: policyArn,
      })
    );
  } catch (err: unknown) {
    if (!isDuplicatePolicy(err)) throw err;
  }

  return `arn:aws:iam::${accountId}:role/${env.iamRoleName}`;
}

export async function setupIam(): Promise<IamSetupResult> {
  const accountId = await getAccountId();
  const policyArn = await createDemoPolicy(accountId);
  const roleArn = await createDemoRole(policyArn, accountId);
  return { roleArn, policyArn, accountId };
}

export async function assumeDemoRole(roleArn: string): Promise<AssumedRoleCredentials> {
  const res = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'aws-demo-session',
      DurationSeconds: 900,
    })
  );

  const creds = res.Credentials;
  if (
    !creds?.AccessKeyId ||
    !creds.SecretAccessKey ||
    !creds.SessionToken ||
    !creds.Expiration
  ) {
    throw new Error('AssumeRole returned incomplete credentials');
  }

  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration,
  };
}

function isEntityAlreadyExists(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'EntityAlreadyExistsException'
  );
}

function isDuplicatePolicy(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'DuplicatePolicyAttachmentException'
  );
}
