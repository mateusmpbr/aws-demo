import {
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { s3Client } from '../../config/aws-client';

export interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
}

export interface S3DownloadResult {
  key: string;
  content: string;
  eTag: string;
}

export async function createBucket(bucketName: string): Promise<void> {
  try {
    // For us-east-1, CreateBucketConfiguration must be omitted (AWS requirement)
    await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
  } catch (err: unknown) {
    if (isBucketAlreadyOwnedByYou(err) || isBucketAlreadyExists(err)) return;
    throw err;
  }
}

export async function uploadObject(
  bucketName: string,
  key: string,
  body: string | Buffer
): Promise<string> {
  const res = await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: 'text/plain',
    })
  );
  return (res.ETag ?? '').replace(/"/g, '');
}

export async function downloadObject(bucketName: string, key: string): Promise<S3DownloadResult> {
  const res = await s3Client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: key })
  );

  if (!res.Body) throw new Error(`S3 GetObject returned no body for key: ${key}`);

  // SDK v3: Body is SdkStreamMixin — use .transformToString() instead of piping streams
  const content = await res.Body.transformToString('utf-8');
  const eTag = (res.ETag ?? '').replace(/"/g, '');

  return { key, content, eTag };
}

export async function listObjects(bucketName: string, prefix?: string): Promise<S3ObjectInfo[]> {
  const res = await s3Client.send(
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix })
  );

  return (res.Contents ?? []).flatMap((item) => {
    if (!item.Key || item.Size === undefined || !item.LastModified) return [];
    return [{ key: item.Key, size: item.Size, lastModified: item.LastModified }];
  });
}

export async function deleteObject(bucketName: string, key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
}

function isBucketAlreadyOwnedByYou(err: unknown): boolean {
  return hasName(err, 'BucketAlreadyOwnedByYou');
}

function isBucketAlreadyExists(err: unknown): boolean {
  return hasName(err, 'BucketAlreadyExists');
}

function hasName(err: unknown, name: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === name
  );
}
