import {
  GetQueueUrlCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';
import { sqsClient } from '../../config/aws-client';

export interface SqsMessage {
  messageId: string;
  receiptHandle: string;
  body: string;
  approximateReceiveCount: number;
}

export interface PollerOptions {
  queueUrl: string;
  maxRetries: number;
  maxMessages?: number;
  onMessage: (msg: SqsMessage) => Promise<void>;
}

export async function getQueueUrl(queueName: string): Promise<string> {
  const res = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
  if (!res.QueueUrl) throw new Error(`Queue not found: ${queueName}`);
  return res.QueueUrl;
}

export async function sendMessage(queueUrl: string, body: string): Promise<string> {
  const res = await sqsClient.send(
    new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body })
  );
  if (!res.MessageId) throw new Error('SendMessage returned no MessageId');
  return res.MessageId;
}

export async function startPoller(options: PollerOptions): Promise<void> {
  const { queueUrl, maxRetries, onMessage } = options;
  const maxMessages = options.maxMessages ?? Infinity;
  let processed = 0;

  while (processed < maxMessages) {
    const res = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        MessageAttributeNames: ['All'],
      })
    );

    const messages = res.Messages ?? [];

    for (const raw of messages) {
      if (!raw.MessageId || !raw.ReceiptHandle || !raw.Body) continue;

      const receiveCount = parseInt(
        raw.Attributes?.['ApproximateReceiveCount'] ?? '1',
        10
      );

      const msg: SqsMessage = {
        messageId: raw.MessageId,
        receiptHandle: raw.ReceiptHandle,
        body: raw.Body,
        approximateReceiveCount: receiveCount,
      };

      try {
        await onMessage(msg);
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: msg.receiptHandle,
          })
        );
        processed++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(
          `  [poller] Message ${msg.messageId} failed (attempt ${receiveCount}/${maxRetries}): ${errMsg}`
        );

        // Reset visibility to 0 so SQS requeues immediately.
        // After maxRetries receives, SQS redrive policy sends it to the DLQ automatically.
        await sqsClient.send(
          new ChangeMessageVisibilityCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: msg.receiptHandle,
            VisibilityTimeout: 0,
          })
        );
      }
    }
  }
}
