import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Generates a presigned URL for uploading a file to R2
 */
export async function getPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });

  return {
    uploadUrl: url,
    publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
  };
}

/**
 * Uploads a file directly from the backend to R2
 */
export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await getS3Client().send(command);

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/**
 * Deletes a file from R2 by key
 */
export async function deleteFromR2(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
  });

  await getS3Client().send(command);
}
