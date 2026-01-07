// Lambda: getPresignedUrl
// Generates presigned URLs for S3 image upload/download

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");

const s3Client = new S3Client({});

const BUCKET_NAME = process.env.IMAGE_BUCKET_NAME || "inspection-images-bucket";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
};

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || "{}");
    const { inspectionId, fileName, contentType, operation } = body;

    if (!inspectionId || !fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Missing required fields: inspectionId, fileName",
        }),
      };
    }

    const imageId = `img_${randomUUID().slice(0, 8)}`;
    const fileExtension = fileName.split(".").pop();
    const s3Key = `inspections/${inspectionId}/${imageId}.${fileExtension}`;

    let url;
    let command;

    if (operation === "download") {
      // Generate download URL
      command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: body.s3Key || s3Key,
      });
      url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
    } else {
      // Default: Generate upload URL
      command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ContentType: contentType || "image/jpeg",
      });
      url = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl: operation !== "download" ? url : undefined,
        downloadUrl: operation === "download" ? url : undefined,
        s3Key,
        imageId,
        expiresIn: operation === "download" ? 3600 : 300,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
