import { Router } from "express";
import { conversationsRouter } from "./conversations";
import { messagesRouter } from "./messages";
import { voiceRouter } from "./voice";

const openaiRouter = Router();

openaiRouter.use("/conversations", conversationsRouter);
openaiRouter.use("/conversations/:id/messages", messagesRouter);
openaiRouter.use("/conversations/:id/voice-messages", voiceRouter);

export default openaiRouter;
