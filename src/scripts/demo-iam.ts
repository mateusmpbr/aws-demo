import { setupIam, assumeDemoRole } from '../services/iam/iam.service';

async function main(): Promise<void> {
  console.log('=== IAM Demo ===\n');

  const { roleArn, policyArn, accountId } = await setupIam();
  console.log(`Account ID:  ${accountId}`);
  console.log(`Policy ARN:  ${policyArn}`);
  console.log(`Role ARN:    ${roleArn}`);

  console.log('\nAssuming role...');
  const creds = await assumeDemoRole(roleArn);
  console.log(`Temporary Access Key: ${creds.accessKeyId}`);
  console.log(`Session Token:        ${creds.sessionToken.substring(0, 30)}...`);
  console.log(`Expires:              ${creds.expiration.toISOString()}`);

  console.log('\nIAM demo complete.');
}

main().catch((err: unknown) => {
  console.error('IAM demo failed:', err);
  process.exit(1);
});
