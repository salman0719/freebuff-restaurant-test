/**
 * Cloudflare R2 storage driver (R2 swap, commit 1). S3-compatible API via
 * `@aws-sdk/client-s3` — R2 speaks the S3 API, so no Worker is needed.
 *
 * The bucket stays **private**. Serving keeps flowing through
 * `/api/images/[...key]` (unguessable-key capability URLs), so no public
 * bucket access, no signed URLs, and no caller changes. Key shape and
 * adapter signatures match the fs driver (`./storage-fs.ts`) exactly:
 * `tenants/{uuid}/logos|items/{uuid}.{ext}`.
 *
 * Config (see `.env.example` and `docs/plans/r2-storage-swap.md`):
 * `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
 * `R2_SECRET_ACCESS_KEY`, optional `R2_ENDPOINT` (defaults to
 * `https://<account>.r2.cloudflarestorage.com`). A missing config fails
 * the upload loudly (thrown error → `INTERNAL` in `tenant-data.ts`),
 * never silently.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { isValidObjectKey } from "./storage-keys";

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

/** Read R2 config from the environment, or `null` when not configured. */
export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  const endpoint = process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;
  return { accountId, bucket, accessKeyId, secretAccessKey, endpoint };
}

/** True when the four required R2 vars are present. */
export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

let cachedClient: S3Client | null = null;
let cachedKey = "";

function clientFor(config: R2Config): S3Client {
  const key = `${config.endpoint}|${config.accessKeyId}|${config.accountId}`;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedKey = key;
  }
  return cachedClient;
}

/** For tests: drop the cached client so credential rotation is honoured. */
export function resetR2ClientForTests(): void {
  cachedClient = null;
  cachedKey = "";
}

function requireConfig(): R2Config {
  const config = getR2Config();
  if (!config) {
    throw new Error(
      "R2 is not configured (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)."
    );
  }
  return config;
}

function mimeForKey(key: string): string | null {
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return EXTENSION_TO_MIME[extension] ?? null;
}

/** Store validated bytes in R2. Throws on invalid keys, missing config, or I/O failures. */
export async function putObjectR2(key: string, bytes: Uint8Array): Promise<void> {
  if (!isValidObjectKey(key)) {
    throw new Error("Invalid object key.");
  }
  const config = requireConfig();
  const mimeType = mimeForKey(key);
  if (!mimeType) {
    throw new Error("Invalid object key.");
  }
  const client = clientFor(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: mimeType,
      ContentLength: bytes.length,
    })
  );
}

/** Read bytes plus their MIME type from R2, or `null` when absent/invalid. */
export async function getObjectR2(
  key: string
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!isValidObjectKey(key)) {
    return null;
  }
  const mimeType = mimeForKey(key);
  if (!mimeType) return null;
  let config: R2Config;
  try {
    config = requireConfig();
  } catch {
    return null;
  }
  const client = clientFor(config);
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const body = response.Body;
    if (!body) return null;
    // `transformToByteArray` exists on v3 response bodies in Node.
    const data = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return { bytes: Buffer.from(data), mimeType };
  } catch (error) {
    const name = (error as { name?: unknown }).name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    // R2/S3 surfaces missing keys under several names; a 404 status means absent too.
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

/** Remove an object from R2; missing keys are fine (idempotent cleanup). */
export async function deleteObjectR2(key: string): Promise<void> {
  if (!isValidObjectKey(key)) {
    return;
  }
  const config = requireConfig();
  const client = clientFor(config);
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

/** Liveness probe for the R2 driver: the bucket is reachable. */
export async function probeStorageR2(): Promise<void> {
  const config = requireConfig();
  const client = clientFor(config);
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
}
