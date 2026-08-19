import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// تخزين ملفات مستقل عن Replit — عبر Supabase Storage (متوافقة مع بروتوكول S3).
// يُستخدم حالياً فقط لوثائق توثيق السائقين (رخصة القيادة / الهوية).
//
// المتغيرات المطلوبة (من: Project Settings > Storage > S3 Connection في لوحة Supabase):
//   SUPABASE_PROJECT_REF       — الجزء الفرعي من رابط مشروعك، مثال: abcdefgh في abcdefgh.supabase.co
//   SUPABASE_S3_ACCESS_KEY_ID
//   SUPABASE_S3_SECRET_ACCESS_KEY
//   SUPABASE_S3_REGION          — تظهر في نفس صفحة S3 Connection (عادة "us-east-1")
//   SUPABASE_STORAGE_BUCKET     — اسم الـ Bucket الذي تنشئه أنت في Supabase Storage
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(name + " غير مضبوط. أضف بيانات Supabase Storage S3 في متغيرات البيئة.");
  }
  return v;
}

function getClient(): S3Client {
  const projectRef = requiredEnv("SUPABASE_PROJECT_REF");
  return new S3Client({
    region: process.env.SUPABASE_S3_REGION || "us-east-1",
    endpoint: "https://" + projectRef + ".supabase.co/storage/v1/s3",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("SUPABASE_S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("SUPABASE_S3_SECRET_ACCESS_KEY"),
    },
  });
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
    return requiredEnv("SUPABASE_STORAGE_BUCKET");
  }

  /** رابط مُوقّع مؤقت (PUT) لرفع وثيقة تحقق سائق من المتصفح مباشرة */
  async getUploadURL(prefix: "verifications" | "parcels" | "voice-messages", ttlSec = 900): Promise<{ uploadUrl: string; objectPath: string }> {
    const client = getClient();
    const objectPath = prefix + "/" + randomUUID();
    const command = new PutObjectCommand({ Bucket: this.bucket(), Key: objectPath });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: ttlSec });
    return { uploadUrl, objectPath };
  }

  /** رابط مُوقّع مؤقت (GET) لعرض وثيقة خاصة (تراجعها الإدارة فقط) */
  async getDownloadURL(objectPath: string, ttlSec = 900): Promise<string> {
    const client = getClient();
    await this.assertExists(objectPath);
    const command = new GetObjectCommand({ Bucket: this.bucket(), Key: objectPath });
    return getSignedUrl(client, command, { expiresIn: ttlSec });
  }

  /** رابط عام مباشر لملف عام إن كانت الـ Bucket عامة (Public) في Supabase */
  getPublicURL(objectPath: string): string | null {
    const projectRef = process.env.SUPABASE_PROJECT_REF;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    if (!projectRef || !bucket) return null;
    return "https://" + projectRef + ".supabase.co/storage/v1/object/public/" + bucket + "/" + objectPath;
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
