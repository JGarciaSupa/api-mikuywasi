import { S3Client } from "bun";

export function getS3Client() {
  return new S3Client({
    bucket: process.env.R2_BUCKET!,
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  });
}