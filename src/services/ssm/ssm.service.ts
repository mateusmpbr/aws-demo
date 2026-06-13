import { PutParameterCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import { ssmClient } from '../../config/aws-client';

export interface SsmReadResult {
  name: string;
  value: string;
  type: 'String' | 'SecureString';
}

export async function writeStringParameter(name: string, value: string): Promise<void> {
  await ssmClient.send(
    new PutParameterCommand({
      Name: name,
      Value: value,
      Type: 'String',
      Overwrite: true,
    })
  );
}

export async function writeSecureParameter(name: string, value: string): Promise<void> {
  await ssmClient.send(
    new PutParameterCommand({
      Name: name,
      Value: value,
      Type: 'SecureString',
      Overwrite: true,
    })
  );
}

export async function readParameter(name: string, withDecryption: boolean): Promise<SsmReadResult> {
  const res = await ssmClient.send(
    new GetParameterCommand({
      Name: name,
      WithDecryption: withDecryption,
    })
  );

  const param = res.Parameter;
  if (!param?.Value || !param.Name || !param.Type) {
    throw new Error(`SSM parameter not found or incomplete: ${name}`);
  }

  const type = param.Type === 'SecureString' ? 'SecureString' : 'String';
  return { name: param.Name, value: param.Value, type };
}
