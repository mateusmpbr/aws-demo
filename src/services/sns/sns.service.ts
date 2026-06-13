import { CreateTopicCommand, SubscribeCommand, PublishCommand } from '@aws-sdk/client-sns';
import { SetQueueAttributesCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { snsClient, sqsClient } from '../../config/aws-client';

export interface SnsPublishResult {
  messageId: string;
  topicArn: string;
}

export interface SnsEnvelope {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
}

export async function createTopic(topicName: string): Promise<string> {
  const res = await snsClient.send(new CreateTopicCommand({ Name: topicName }));
  if (!res.TopicArn) throw new Error(`CreateTopic returned no ARN for: ${topicName}`);
  return res.TopicArn;
}

export async function subscribeQueueToTopic(
  topicArn: string,
  queueArn: string,
  queueUrl: string,
  accountId: string
): Promise<string> {
  // SNS requires explicit sqs:SendMessage permission on the target queue
  const region = queueArn.split(':')[3] ?? 'us-east-1';
  const queueName = queueArn.split(':').pop() ?? '';
  const queueArnFull = `arn:aws:sqs:${region}:${accountId}:${queueName}`;

  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowSNSPublish',
        Effect: 'Allow',
        Principal: { Service: 'sns.amazonaws.com' },
        Action: 'sqs:SendMessage',
        Resource: queueArnFull,
        Condition: { ArnEquals: { 'aws:SourceArn': topicArn } },
      },
    ],
  });

  await sqsClient.send(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: { Policy: policy },
    })
  );

  const res = await snsClient.send(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: 'sqs',
      Endpoint: queueArn,
      Attributes: { RawMessageDelivery: 'false' },
    })
  );

  if (!res.SubscriptionArn) throw new Error('Subscribe returned no SubscriptionArn');
  return res.SubscriptionArn;
}

export async function publishToTopic(
  topicArn: string,
  message: string,
  subject: string
): Promise<SnsPublishResult> {
  const res = await snsClient.send(
    new PublishCommand({ TopicArn: topicArn, Message: message, Subject: subject })
  );
  if (!res.MessageId) throw new Error('Publish returned no MessageId');
  return { messageId: res.MessageId, topicArn };
}

export async function verifyDelivery(queueUrl: string, expectedMessageId: string): Promise<string> {
  // Poll up to 15 seconds to find the message delivered from SNS
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const res = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
      })
    );

    for (const raw of res.Messages ?? []) {
      if (!raw.Body || !raw.ReceiptHandle) continue;

      const envelope = JSON.parse(raw.Body) as SnsEnvelope;

      // Delete the message regardless (we're in demo context, not the SQS poller)
      await sqsClient.send(
        new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: raw.ReceiptHandle })
      );

      if (envelope.MessageId === expectedMessageId) {
        return envelope.Message;
      }
    }
  }

  throw new Error(`SNS message ${expectedMessageId} did not arrive in SQS within 15 seconds`);
}
