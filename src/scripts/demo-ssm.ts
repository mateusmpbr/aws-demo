import { writeStringParameter, writeSecureParameter, readParameter } from '../services/ssm/ssm.service';
import { env } from '../config/env';

async function main(): Promise<void> {
  console.log('=== SSM Parameter Store Demo ===\n');

  // String parameter
  await writeStringParameter(env.ssmStringParam, env.ssmStringValue);
  console.log(`Written String:  ${env.ssmStringParam} = "${env.ssmStringValue}"`);

  const strResult = await readParameter(env.ssmStringParam, false);
  console.log(`Read String:     ${strResult.name} = "${strResult.value}" [${strResult.type}]`);
  console.log(`Round-trip OK:   ${strResult.value === env.ssmStringValue}`);

  console.log('');

  // SecureString parameter
  // Note: full decryption requires LocalStack Pro with LOCALSTACK_AUTH_TOKEN set
  await writeSecureParameter(env.ssmSecureParam, env.ssmSecureValue);
  console.log(`Written Secure:  ${env.ssmSecureParam} = (value encrypted at rest)`);

  const secResult = await readParameter(env.ssmSecureParam, true);
  console.log(`Read Secure:     ${secResult.name} = "${secResult.value}" [${secResult.type}]`);
  console.log(`Decryption OK:   ${secResult.value === env.ssmSecureValue}`);

  console.log('\nSSM demo complete.');
}

main().catch((err: unknown) => {
  console.error('SSM demo failed:', err);
  process.exit(1);
});
