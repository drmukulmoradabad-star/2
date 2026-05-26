import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { voiceChatStream, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import {
  SendOpenaiVoiceMessageParams,
  SendOpenaiVoiceMessageBody,
} from "@workspace/api-zod";

export const voiceRouter = Router({ mergeParams: true });

voiceRouter.post("/", async (req, res) => {
  const paramsParsed = SendOpenaiVoiceMessageParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  const bodyParsed = SendOpenaiVoiceMessageBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const conversationId = paramsParsed.data.id;
  const audioBase64 = bodyParsed.data.audio;

  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const { buffer, format } = await ensureCompatibleFormat(audioBuffer);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await voiceChatStream(buffer, "alloy", format);

    let assistantTranscript = "";
    let userTranscript = "";

    for await (const event of stream) {
      if (event.type === "transcript") {
        assistantTranscript += event.data;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    await db.insert(messages).values([
      {
        conversationId,
        role: "user",
        content: userTranscript || "[Voice message]",
      },
      {
        conversationId,
        role: "assistant",
        content: assistantTranscript,
      },
    ]);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to process voice message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process voice message" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Voice stream error" })}\n\n`);
      res.end();
    }
  }
});
