import type { SQSClient } from '@aws-sdk/client-sqs';
import type { S3Client } from "@aws-sdk/client-s3"
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb"


const REGION = "me-central-1"

let s3: S3Client | undefined
let dyanmodb: DynamoDBClient | undefined
let sqs: SQSClient | undefined


export async function getS3(): Promise<S3Client> {
    if (s3 === undefined) {
        const { S3Client } = await import("@aws-sdk/client-s3")
        s3 = new S3Client({ region: REGION })
    }
    return s3
}

export async function getDynamoDb(): Promise<DynamoDBClient> {
    if (dyanmodb === undefined) {
        const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb")
        dyanmodb = new DynamoDBClient({ region: REGION })
    }
    return dyanmodb
}

export async function getSQS(): Promise<SQSClient> {
    if (sqs === undefined) {
        const { SQSClient } = await import("@aws-sdk/client-sqs")
        sqs = new SQSClient({ region: REGION })

    }
    return sqs
}