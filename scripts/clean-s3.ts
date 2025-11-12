import { Client } from "minio";
import {
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_SECRET_KEY,
  MINIO_SECURE,
} from "../src/core/config.js";

function parseEndpoint(endpoint: string): { host: string; port: number } {
  // Simple parse for host:port format
  if (!endpoint.includes("://")) {
    const parts = endpoint.split(":");
    const host = parts[0];
    const port = parts[1] ? parseInt(parts[1], 10) : 9000;
    return { host, port };
  }

  // Parse as URL if it has protocol
  const url = new URL(endpoint);
  const host = url.hostname;
  const port = url.port ? parseInt(url.port, 10) : 9000;

  return { host, port };
}

async function cleanS3() {
  console.log(`\n🔧 Configuration:`);
  console.log(`   Endpoint: ${MINIO_ENDPOINT}`);
  console.log(`   Bucket: ${MINIO_BUCKET}`);
  console.log(`   Secure: ${MINIO_SECURE}`);
  console.log();

  if (!MINIO_ENDPOINT || MINIO_ENDPOINT.trim() === "") {
    console.error(`❌ MINIO_ENDPOINT is not set or empty`);
    console.error(`   Please ensure Docker services are running: make up`);
    process.exit(1);
  }

  const { host, port } = parseEndpoint(MINIO_ENDPOINT);

  console.log(`📍 Parsed endpoint:`);
  console.log(`   Host: "${host}"`);
  console.log(`   Port: ${port}`);
  console.log();

  if (!host || host.trim() === "") {
    console.error(`❌ Failed to parse host from endpoint: ${MINIO_ENDPOINT}`);
    process.exit(1);
  }

  const client = new Client({
    endPoint: host,
    port: port,
    useSSL: MINIO_SECURE,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
  });

  console.log(`🧹 Cleaning S3 bucket: ${MINIO_BUCKET}`);

  try {
    const exists = await client.bucketExists(MINIO_BUCKET);
    if (!exists) {
      console.log(
        `✅ Bucket ${MINIO_BUCKET} doesn't exist. Nothing to clean.`
      );
      return;
    }

    const objectsStream = client.listObjects(MINIO_BUCKET, "", true);
    const objects: string[] = [];

    for await (const obj of objectsStream) {
      if (obj.name) {
        objects.push(obj.name);
      }
    }

    if (objects.length === 0) {
      console.log(`✅ Bucket ${MINIO_BUCKET} is already empty.`);
      return;
    }

    console.log(`📦 Found ${objects.length} objects to clean...`);

    for (const objectName of objects) {
      await client.removeObject(MINIO_BUCKET, objectName);
      console.log(`   ✓ Cleaned: ${objectName}`);
    }

    console.log(`\n✅ Successfully cleaned ${objects.length} objects from S3`);
  } catch (error) {
    console.error(`❌ Error cleaning S3:`, error);
    console.error(`   Is Docker running? Try: make up`);
    process.exit(1);
  }
}

cleanS3();
