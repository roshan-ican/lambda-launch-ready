import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, type SQSClient } from "@aws-sdk/client-sqs";

export async function replay(sqs: SQSClient, fromUrl: string, toUrl: string): Promise<number> {
    let moved = 0
    while (true) {
        const { Messages } = await sqs.send(new ReceiveMessageCommand({
            QueueUrl: fromUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 1
        }))
        if (!Messages || Messages.length === 0) {
            return moved
        }
        for (const m of Messages) {
            if (!m.Body || !m.ReceiptHandle) continue
            await sqs.send(new SendMessageCommand({ QueueUrl: toUrl, MessageBody: m.Body }))

            await sqs.send(new DeleteMessageCommand({
                QueueUrl: fromUrl,
                ReceiptHandle: m.ReceiptHandle
            }))
            moved++
        }
    }
}