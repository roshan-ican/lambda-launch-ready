import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { sqs } from "@/lib/aws";

// Same logic as 03-webhook-reliability/src/replay.ts: send first, then delete,
// so a crash can only cause a duplicate (which the worker skips), never a loss.
export async function POST() {
  const url = async (q: string) => (await sqs.send(new GetQueueUrlCommand({ QueueName: q }))).QueueUrl!;
  const from = await url("payments-dlq");
  const to = await url("payments");

  let moved = 0;
  while (true) {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: from, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }),
    );
    if (!Messages || Messages.length === 0) return Response.json({ moved });
    for (const m of Messages) {
      if (!m.Body || !m.ReceiptHandle) continue;
      await sqs.send(new SendMessageCommand({ QueueUrl: to, MessageBody: m.Body }));
      await sqs.send(new DeleteMessageCommand({ QueueUrl: from, ReceiptHandle: m.ReceiptHandle }));
      moved++;
    }
  }
}
