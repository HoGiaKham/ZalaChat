import express from "express";
import { getConversations, getMessages, getLastMessages } from "../controllers/chatController.js";
const router = express.Router();

router.get("/conversations", getConversations);
router.get("/messages/:conversationId", getMessages);
router.get("/last-messages", getLastMessages);

export default router;