import { createTopic, subscribeQueueToTopic, publishToTopic, verifyDelivery } from '../services/sns/sns.service';
import { getQueueUrl } from '../services/sqs/sqs.service';
import { stsClient } from '../config/aws-client';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { env } from '../config/env';

async function main(): Promise<void> {
  console.log('=== SNS Demo ===\n');

  // Resolve account ID for ARN construction
  const identity = await stsClient.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account ?? '000000000000';

  // Create SNS topic (idempotent)
  const topicArn = await createTopic(env.snsTopicName);
  console.log(`Topic ARN: ${topicArn}`);

  // Resolve the SQS queue that will receive SNS messages
  const queueUrl = await getQueueUrl(env.sqsQueueName);
  const queueArn = `arn:aws:sqs:${env.awsRegion}:${accountId}:${env.sqsQueueName}`;
  console.log(`Queue ARN: ${queueArn}`);

  // Set SQS access policy + subscribe queue to topic
  const subscriptionArn = await subscribeQueueToTopic(topicArn, queueArn, queueUrl, accountId);
  console.log(`Subscription ARN: ${subscriptionArn}`);

  // Publish a message to the topic
  const payload = `Hello from SNS! Timestamp: ${new Date().toISOString()}`;
  const { messageId } = await publishToTopic(topicArn, payload, 'Demo Subject');
  console.log(`\nPublished message ID: ${messageId}`);

  // Verify the message arrived in the subscribed SQS queue
  console.log('Verifying delivery in SQS (polling up to 15 seconds)...');
  const delivered = await verifyDelivery(queueUrl, messageId);
  console.log(`Delivered body:  "${delivered}"`);
  console.log(`Payload matches: ${delivered === payload}`);

  console.log('\nSNS demo complete.');
}

main().catch((err: unknown) => {
  console.error('SNS demo failed:', err);
  process.exit(1);
});
