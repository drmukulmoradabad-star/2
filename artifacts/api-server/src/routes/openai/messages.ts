import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
  ListOpenaiMessagesParams,
} from "@workspace/api-zod";

export const messagesRouter = Router({ mergeParams: true });

const DENTAL_SYSTEM_PROMPT = `You are an expert AI dental assistant integrated into an orthodontic CAD platform. You assist orthodontists, prosthodontists, and dental specialists with clinical questions and CAD workflows.

Your areas of expertise include:
- Orthodontics: tooth movement mechanics, bracket placement, wire sequencing, force systems
- Prosthodontics: crown and bridge design, implant planning, occlusal rehabilitation
- Dental anatomy: tooth morphology, root anatomy, periodontal structures
- Occlusion: centric relation, centric occlusion, anterior guidance, condylar guidance
- Cephalometrics: landmark identification, angular and linear measurements, growth assessment
- Clear aligner therapy: staging concepts, attachment design, refinement protocols, interproximal reduction
- Dental scanning: intraoral scanner workflows, scan stitching, occlusal registration
- STL workflows: mesh processing, file formats (STL, OBJ, PLY), mesh repair, boolean operations
- 3D printing: material selection, support structures, post-processing for dental models
- Treatment planning: diagnosis, objective setting, sequencing, interdisciplinary coordination

Provide accurate, clinically relevant answers. Use proper dental terminology. When discussing CAD workflows, be specific about digital dentistry processes. If asked about something outside dental scope, politely redirect to dental topics.

Keep responses concise but comprehensive. Use structured formatting when appropriate (numbered steps, bullet points for lists). Always prioritize patient safety in clinical recommendations.`;

messagesRouter.get("/", async (req, res) => {
  const parsed = ListOpenaiMessagesParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  try {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, parsed.data.id))
      .orderBy(messages.createdAt);
    res.json(msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

messagesRouter.post("/", async (req, res) => {
  const paramsParsed = SendOpenaiMessageParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  const bodyParsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const conversationId = paramsParsed.data.id;
  const userContent = bodyParsed.data.content;

  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const [userMsg] = await db
      .insert(messages)
      .values({ conversationId, role: "user", content: userContent })
      .returning();

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    const chatMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: DENTAL_SYSTEM_PROMPT },
        ...chatMessages,
      ],
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: fullResponse,
    });

    if (conv.title === "New Conversation" || conv.title.startsWith("New Conversation")) {
      const titleWords = userContent.slice(0, 60).replace(/\n/g, " ").trim();
      const autoTitle = titleWords.length > 0 ? titleWords : "Dental Consultation";
      await db
        .update(conversations)
        .set({ title: autoTitle })
        .where(eq(conversations.id, conversationId));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to send message" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});
