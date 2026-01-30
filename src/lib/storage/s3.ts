import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  type CreateBucketCommandInput,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const resolveEnv = (key: string) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing ${key} environment variable`)
  }
  return value
}

export function getS3Client() {
  const endpoint = resolveEnv("S3_ENDPOINT")
  const region = process.env.S3_REGION ?? "us-east-1"
  const accessKeyId = resolveEnv("S3_ACCESS_KEY")
  const secretAccessKey = resolveEnv("S3_SECRET_KEY")
  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE === "true" || endpoint.includes("localhost")

  return new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle,
  })
}

export async function ensureBucketExists(bucket: string) {
  const client = getS3Client()

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode
    const name = (error as { name?: string }).name

    if (status !== 404 && name !== "NotFound" && name !== "NoSuchBucket") {
      throw error
    }

    const region = process.env.S3_REGION ?? "us-east-1"
    const createPayload: CreateBucketCommandInput =
      region === "us-east-1"
        ? { Bucket: bucket }
        : {
            Bucket: bucket,
            CreateBucketConfiguration: {
              LocationConstraint: region as BucketLocationConstraint,
            },
          }

    await client.send(new CreateBucketCommand(createPayload))
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicRead",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  }

  try {
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify(policy),
      })
    )
  } catch {
    // Ignore policy errors to keep presign flow working in locked-down buckets.
  }

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "PUT"],
              AllowedOrigins: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      })
    )
  } catch {
    // Ignore CORS errors; MinIO can be configured manually if needed.
  }
}

export async function createPresignedPutUrl({
  bucket,
  key,
  contentType,
  expiresIn = 60,
}: {
  bucket: string
  key: string
  contentType: string
  expiresIn?: number
}) {
  const client = getS3Client()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  return getSignedUrl(client, command, { expiresIn })
}

export function getPublicObjectUrl({
  baseUrl,
  bucket,
  key,
}: {
  baseUrl: string
  bucket: string
  key: string
}) {
  const normalizedBase = baseUrl.replace(/\/+$/, "")
  if (normalizedBase.endsWith(`/${bucket}`)) {
    return `${normalizedBase}/${key}`
  }

  return `${normalizedBase}/${bucket}/${key}`
}
