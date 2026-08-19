import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import {
  SUPABASE_PROJECT_REF,
  SUPABASE_S3_ACCESS_KEY_ID,
  SUPABASE_S3_SECRET_ACCESS_KEY,
  SUPABASE_S3_REGION,
  SUPABASE_STORAGE_BUCKET,
} from "./env";

export class ObjectStorageNotConfiguredError extends Error {
  constructor() {
    super("Object Storage غير مُعدّل. أضف متغيرات Supabase S3 في إعدادات البيئة.");
    this.name = "ObjectStorageNotConfiguredError";
    Object.setPrototypeOf(this, ObjectStorageNotConfiguredError.prototype);
  }
}

function assertConfigured() {
  if (
    !SUPABASE_PROJECT_REF ||
    !SUPABASE_S3_ACCESS_KEY_ID ||
    !SUPABASE_S3_SECRET_ACCESS_KEY ||
    !SUPABASE_STORAGE_BUCKET
  ) {
    throw new ObjectStorageNotConfiguredError();
  }
}

let _client: S3Client | null = null;
function getClient(): S3Client {
  assertConfigured();
  if (!_client) {
    _client = new S3Client({
      region: SUPABASE_S3_REGION || "us-east-1",
      endpoint: "https://" + SUPABASE_PROJECT_REF + ".supabase.co/storage/v1/s3",
      forcePathStyle: true,
      credentials: {
        accessKeyId: SUPABASE_S3_ACCESS_KEY_ID,
        secretAccessKey: SUPABASE_S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private bucket(): string {
    assertConfigured();
    return SUPABASE_STORAGE_BUCKET;
  }

  async getUploadURL(
    prefix: "verifications" | "parcels" | "voice-messages",
    ttlSec = 900,
  ): Promise<{ uploadUrl: string; objectPath: string }> {
    const client = getClient();
    const objectPath = prefix + "/" + randomUUID();
    const command = new PutObjectCommand({ Bucket: this.bucket(), Key: objectPath });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: ttlSec });
    return { uploadUrl, objectPath };
  }

  async getDownloadURL(objectPath: string, ttlSec = 900): Promise<string> {
    const client = getClient();
    await this.assertExists(objectPath);
    const command = new GetObjectCommand({ Bucket: this.bucket(), Key: objectPath });
    return getSignedUrl(client, command, { expiresIn: ttlSec });
  }

  getPublicURL(objectPath: string): string | null {
    if (!SUPABASE_PROJECT_REF || !SUPABASE_STORAGE_BUCKET) return null;
    return (
      "https://" +
      SUPABASE_PROJECT_REF +
      ".supabase.co/storage/v1/object/public/" +
      SUPABASE_STORAGE_BUCKET +
      "/" +
      objectPath
    );
  }

  private async assertExists(objectPath: string): Promise<void> {
    const client = getClient();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket(), Key: objectPath }));
    } catch {
      throw new ObjectNotFoundError();
    }
  }
}

export const objectStorage = new ObjectStorageService();
