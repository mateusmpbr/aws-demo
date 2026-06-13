import { getQueueUrl, sendMessage, startPoller, SqsMessage } from '../services/sqs/sqs.service';
import { env } from '../config/env';

interface MessageBody {
  demo: boolean;
  index: number;
}

async function main(): Promise<void> {
  console.log('=== SQS Demo ===\n');

  const queueUrl = await getQueueUrl(env.sqsQueueName);
  const dlqUrl = await getQueueUrl(env.sqsDlqName);
  console.log(`Queue URL: ${queueUrl}`);
  console.log(`DLQ URL:   ${dlqUrl}`);

  // Send 3 messages
  console.log('');
  for (let i = 1; i <= 3; i++) {
    const msgId = await sendMessage(queueUrl, JSON.stringify({ demo: true, index: i }));
    console.log(`Sent message ${i}: ${msgId}`);
  }

  // Message with index=2 will fail on its first attempt to demonstrate retry + DLQ behavior
  let attempt2Count = 0;

  console.log(`\nStarting poller (WaitTimeSeconds=20, stops after 3 successful messages)...\n`);

  await startPoller({
    queueUrl,
    maxRetries: env.sqsMaxRetries,
    maxMessages: 3,
    onMessage: async (msg: SqsMessage) => {
      const body = JSON.parse(msg.body) as MessageBody;
      console.log(
        `  Received: index=${body.index}  receiveCount=${msg.approximateReceiveCount}  msgId=${msg.messageId}`
      );

      if (body.index === 2 && attempt2Count === 0) {
        attempt2Count++;
        throw new Error('Simulated processing failure for message index=2 (first attempt)');
      }

      console.log(`  Processed OK: index=${body.index}`);
    },
  });

  console.log('\nSQS demo complete.');
}

main().catch((err: unknown) => {
  console.error('SQS demo failed:', err);
  process.exit(1);
});
