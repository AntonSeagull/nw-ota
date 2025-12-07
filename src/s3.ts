import * as fs from 'node:fs';

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  S3Config,
  UpdateEntry,
} from './types.js';

export function createS3Client(config: S3Config): S3Client {
    const clientConfig: any = {
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    };

    if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
        clientConfig.forcePathStyle = true; // For S3-compatible services
    }

    return new S3Client(clientConfig);
}

export async function uploadFile(
    client: S3Client,
    bucket: string,
    key: string,
    filePath: string,
    region: string,
    endpoint?: string
): Promise<string> {
    const fileContent = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: 'application/zip',
    });

    await client.send(command);

    // Return public URL (assuming public bucket or using endpoint)
    if (endpoint) {
        // For S3-compatible services
        return `${endpoint}/${bucket}/${key}`;
    } else {
        // For AWS S3
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }
}

export async function downloadFile(
    client: S3Client,
    bucket: string,
    key: string
): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
        throw new Error('Empty response body');
    }

    // Convert stream to string
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return buffer.toString('utf-8');
}

export async function getUpdateJson(
    client: S3Client,
    bucket: string,
    key: string
): Promise<UpdateEntry[]> {
    try {
        const content = await downloadFile(client, bucket, key);
        return JSON.parse(content);
    } catch (error: any) {
        // If file doesn't exist, return empty array
        if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
            return [];
        }
        throw error;
    }
}

export async function saveUpdateJson(
    client: S3Client,
    bucket: string,
    key: string,
    updates: UpdateEntry[]
): Promise<void> {
    const content = JSON.stringify(updates, null, 2);
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: 'application/json',
    });

    await client.send(command);
}

