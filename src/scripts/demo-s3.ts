import {
  createBucket,
  uploadObject,
  downloadObject,
  listObjects,
  deleteObject,
} from '../services/s3/s3.service';
import { env } from '../config/env';

async function main(): Promise<void> {
  console.log('=== S3 Demo ===\n');

  // Create bucket (idempotent)
  await createBucket(env.s3BucketName);
  console.log(`Created bucket: ${env.s3BucketName}`);

  // Upload
  const content = [
    `Demo file created at ${new Date().toISOString()}`,
    'Hello from LocalStack S3!',
  ].join('\n');

  const eTag = await uploadObject(env.s3BucketName, env.s3ObjectKey, content);
  console.log(`Uploaded: ${env.s3ObjectKey} (ETag: ${eTag})`);

  // List
  let objects = await listObjects(env.s3BucketName);
  console.log(`\nListed ${objects.length} object(s):`);
  for (const obj of objects) {
    console.log(`  - ${obj.key} (${obj.size} bytes, modified ${obj.lastModified.toISOString()})`);
  }

  // Download
  const downloaded = await downloadObject(env.s3BucketName, env.s3ObjectKey);
  console.log(`\nDownloaded content:\n${downloaded.content}`);

  // Delete
  await deleteObject(env.s3BucketName, env.s3ObjectKey);
  console.log(`Deleted: ${env.s3ObjectKey}`);

  // Confirm deletion
  objects = await listObjects(env.s3BucketName);
  console.log(`Objects after delete: ${objects.length}`);

  console.log('\nS3 demo complete.');
}

main().catch((err: unknown) => {
  console.error('S3 demo failed:', err);
  process.exit(1);
});
