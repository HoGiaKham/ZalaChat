import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chats.js";
import contactRoutes from "./routes/contacts.js";
import groupRoutes from "./routes/groups.js";
import uploadRoutes from "./routes/upload.js";
import { dynamoDBClient } from "./config/aws.js";
import AWS from "aws-sdk";
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

global.io = io;

const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION || "us-east-1",
});

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use("/uploads", express.static(path.resolve("uploads")));

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/upload", uploadRoutes);

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  console.log(`Socket Authentication Attempt: Token=${token ? token.slice(0, 10) + "..." : "No token"}`);
  if (!token) {
    console.error("Authentication error: No token provided");
    return next(new Error("Authentication error: No token"));
  }
  try {
    const userData = await cognitoISP.getUser({ AccessToken: token }).promise();
    socket.user = { sub: userData.Username };
    console.log(`Authenticated user: ${socket.user.sub} (Socket ID: ${socket.id})`);
    next();
  } catch (error) {
    console.error(`Authentication error for token ${token.slice(0, 10) + "..."}:`, error.message);
    next(new Error("Authentication error: Invalid token"));
  }
});

// Helper Function to Determine File Type
const getFileType = (url) => {
  if (!url) return "file";
  if (/\.(jpg|jpeg|png|gif)$/i.test(url)) return "image";
  if (/\.(mp3|wav|ogg|webm)$/i.test(url)) return "audio"; // Thêm .webm vào audio
  if (/\.(mp4|avi|mkv|mov)$/i.test(url)) return "video"; // Loại .webm khỏi video
  return "file";
};

// Socket.IO Connection Handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.sub} (Socket ID: ${socket.id})`);

  // Handle connection errors
  socket.on("connect_error", (error) => {
    console.error(`Socket.IO connection error for user ${socket.user.sub}:`, error.message);
  });

  // Join personal room based on user sub
  socket.join(socket.user.sub);
  console.log(`User ${socket.user.sub} joined personal room: ${socket.user.sub}`);

  // Join Conversation Room
  socket.on("joinConversation", ({ conversationId }) => {
    if (!conversationId) {
      console.error("Invalid conversationId in joinConversation");
      return;
    }
    socket.join(conversationId);
    console.log(`User ${socket.user.sub} joined conversation: ${conversationId}`);
    const roomUsers = io.sockets.adapter.rooms.get(conversationId);
    console.log(`Users in conversation ${conversationId}:`, Array.from(roomUsers || []));
  });

  // Join Group Room
  socket.on("joinGroup", ({ groupId }) => {
    if (!groupId) {
      console.error("Invalid groupId in joinGroup");
      return;
    }
    socket.join(groupId);
    console.log(`User ${socket.user.sub} joined group: ${groupId}`);
  });

  // Disconnect Handling
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user.sub} (Socket ID: ${socket.id})`);
  });

  // --- Individual Chat Handlers ---
  socket.on("sendMessage", async (message) => {
    try {
      if (!message.conversationId || !message.content) {
        throw new Error("Invalid message data: Missing conversationId or content");
      }
      const messageData = { ...message, status: "sent" };
      await dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Item: messageData,
        })
      );
      console.log(`Emitting message to conversation ${message.conversationId}:`, messageData);
      io.to(message.conversationId).emit("receiveMessage", messageData);
    } catch (error) {
      console.error("Error saving message:", error.message);
    }
  });

  socket.on("recallMessage", async ({ conversationId, timestamp }) => {
    try {
      if (!conversationId || !timestamp) {
        throw new Error("Invalid recall data: Missing conversationId or timestamp");
      }
      await dynamoDBClient.send(
        new UpdateCommand({
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Key: { conversationId, timestamp },
          UpdateExpression: "set #status = :status, #type = :type",
          ExpressionAttributeNames: { "#status": "status", "#type": "type" },
          ExpressionAttributeValues: { ":status": "recalled", ":type": "recalled" },
        })
      );
      console.log(`Emitting messageRecalled to conversation ${conversationId}`);
      io.to(conversationId).emit("messageRecalled", { conversationId, timestamp });
    } catch (error) {
      console.error("Error recalling message:", error.message);
    }
  });

  socket.on("deleteMessage", async ({ conversationId, timestamp }) => {
    try {
      if (!conversationId || !timestamp) {
        throw new Error("Invalid delete data: Missing conversationId or timestamp");
      }
      await dynamoDBClient.send(
        new UpdateCommand({
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Key: { conversationId, timestamp },
          UpdateExpression: "set #status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": "deleted" },
        })
      );
      console.log(`Emitting messageDeleted to conversation ${conversationId}`);
      io.to(conversationId).emit("messageDeleted", { conversationId, timestamp });
    } catch (error) {
      console.error("Error deleting message:", error.message);
    }
  });

  socket.on("forwardMessage", async ({ conversationId, newConversationId, content, type, forwardedFrom }) => {
    try {
      if (!newConversationId || !content) {
        throw new Error("Invalid forward data: Missing newConversationId or content");
      }
      const newMessage = {
        conversationId: newConversationId,
        timestamp: new Date().toISOString(),
        content,
        type,
        forwardedFrom,
        status: "sent",
      };
      await dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Item: newMessage,
        })
      );
      console.log(`Emitting forwarded message to conversation ${newConversationId}:`, newMessage);
      io.to(newConversationId).emit("receiveMessage", newMessage);
    } catch (error) {
      console.error("Error forwarding message:", error.message);
    }
  });

  // --- Group Chat Handlers ---
  socket.on("sendGroupMessage", async (message) => {
    try {
      if (!message.groupId || !message.content) {
        throw new Error("Invalid group message data: Missing groupId or content");
      }
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const messageType = message.content.startsWith("https://zalachat-images.s3.")
        ? getFileType(message.content)
        : message.type || "text";

      const messageData = {
        groupId: message.groupId,
        messageId,
        senderId: socket.user.sub,
        content: message.content,
        type: messageType,
        timestamp,
        status: "sent",
      };

      console.log("Saving group message to DynamoDB:", messageData);
      await dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_GROUP_MESSAGES,
          Item: messageData,
        })
      );

      console.log(`Emitting group message to group ${message.groupId}:`, messageData);
      io.to(message.groupId).emit("receiveGroupMessage", messageData);
    } catch (error) {
      console.error("Error saving group message:", error.message);
    }
  });

  socket.on("recallGroupMessage", async ({ groupId, timestamp }) => {
    try {
      if (!groupId || !timestamp) {
        throw new Error("Invalid recall data: Missing groupId or timestamp");
      }
      await dynamoDBClient.send(
        new UpdateCommand({
          TableName: process.env.DYNAMODB_TABLE_GROUP_MESSAGES,
          Key: { groupId, timestamp },
          UpdateExpression: "set #status = :status, #type = :type",
          ExpressionAttributeNames: { "#status": "status", "#type": "type" },
          ExpressionAttributeValues: { ":status": "recalled", ":type": "recalled" },
        })
      );
      console.log(`Emitting groupMessageRecalled to group ${groupId}`);
      io.to(groupId).emit("groupMessageRecalled", { groupId, timestamp });
    } catch (error) {
      console.error("Error recalling group message:", error.message);
    }
  });

  socket.on("deleteGroupMessage", async ({ groupId, timestamp }) => {
    try {
      if (!groupId || !timestamp) {
        throw new Error("Invalid delete data: Missing groupId or timestamp");
      }
      await dynamoDBClient.send(
        new UpdateCommand({
          TableName: process.env.DYNAMODB_TABLE_GROUP_MESSAGES,
          Key: { groupId, timestamp },
          UpdateExpression: "set #status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": "deleted" },
        })
      );
      console.log(`Emitting groupMessageDeleted to group ${groupId}`);
      io.to(groupId).emit("groupMessageDeleted", { groupId, timestamp });
    } catch (error) {
      console.error("Error deleting group message:", error.message);
    }
  });

  socket.on("forwardGroupMessage", async ({ groupId, newGroupId, content, type, forwardedFrom }) => {
    try {
      if (!newGroupId || !content) {
        throw new Error("Invalid forward data: Missing newGroupId or content");
      }
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const newMessage = {
        groupId: newGroupId,
        messageId,
        senderId: socket.user.sub,
        content,
        type,
        forwardedFrom,
        timestamp,
        status: "sent",
      };
      console.log("Saving forwarded group message to DynamoDB:", newMessage);
      await dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_GROUP_MESSAGES,
          Item: newMessage,
        })
      );
      console.log(`Emitting forwarded group message to group ${newGroupId}:`, newMessage);
      io.to(newGroupId).emit("receiveGroupMessage", newMessage);
    } catch (error) {
      console.error("Error forwarding group message:", error.message);
    }
  });

  // --- Individual Call Handlers ---
  socket.on("callRequest", ({ conversationId, to, callType }) => {
    if (!conversationId || !to || !callType) {
      console.error("Invalid callRequest data:", { conversationId, to, callType });
      return;
    }
    if (to === socket.user.sub) {
      console.error("Error: Cannot call self");
      return;
    }
    console.log(`Received callRequest: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}, callType=${callType}`);
    io.to(to).emit("callRequest", {
      from: socket.user.sub,
      conversationId,
      callType,
    });
    console.log(`Sent callRequest to ${to}`);
  });

  socket.on("callResponse", ({ to, conversationId, accepted }) => {
    if (!to || !conversationId || typeof accepted !== "boolean") {
      console.error("Invalid callResponse data:", { to, conversationId, accepted });
      return;
    }
    console.log(`Received callResponse: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}, accepted=${accepted}`);
    io.to(to).emit("callResponse", {
      from: socket.user.sub,
      conversationId,
      accepted,
    });
    console.log(`Sent callResponse to ${to}`);
  });

  socket.on("call:offer", ({ to, conversationId, offer }) => {
    if (!to || !conversationId || !offer) {
      console.error("Invalid call offer data:", { to, conversationId, offer });
      return;
    }
    console.log(`Received call offer: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("offer", {
      from: socket.user.sub,
      conversationId,
      offer,
    });
    console.log(`Sent call offer to ${to}`);
  });

  socket.on("call:answer", ({ to, conversationId, answer }) => {
    if (!to || !conversationId || !answer) {
      console.error("Invalid call answer data:", { to, conversationId, answer });
      return;
    }
    console.log(`Received call answer: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("answer", {
      from: socket.user.sub,
      conversationId,
      answer,
    });
    console.log(`Sent call answer to ${to}`);
  });

  socket.on("iceCandidate", ({ to, conversationId, candidate }) => {
    if (!to || !conversationId || !candidate) {
      console.error("Invalid iceCandidate data:", { to, conversationId, candidate });
      return;
    }
    console.log(`Received iceCandidate: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("iceCandidate", {
      from: socket.user.sub,
      conversationId,
      candidate,
    });
    console.log(`Sent iceCandidate to ${to}`);
  });

  socket.on("callEnd", ({ to, conversationId }) => {
    if (!to || !conversationId) {
      console.error("Invalid callEnd data:", { to, conversationId });
      return;
    }
    console.log(`Received callEnd: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("callEnd", {
      from: socket.user.sub,
      conversationId,
    });
    console.log(`Sent callEnd to ${to}`);
  });

  // --- Group Video Call Handlers ---
  socket.on("group:offer", (data) => {
    if (!data.groupId || !data.sdp || !data.senderId) {
      console.error("Invalid group:offer data:", data);
      return;
    }
    console.log(`Broadcasting group offer: from=${data.senderId}, groupId=${data.groupId}`);
    io.to(data.groupId).emit("group:offer", {
      sdp: data.sdp,
      senderId: data.senderId,
      groupId: data.groupId,
    });
  });

  socket.on("group:answer", (data) => {
    if (!data.groupId || !data.sdp || !data.senderId || !data.receiverId) {
      console.error("Invalid group:answer data:", data);
      return;
    }
    console.log(`Broadcasting group answer: from=${data.senderId}, to=${data.receiverId}, groupId=${data.groupId}`);
    io.to(data.groupId).emit("group:answer", {
      sdp: data.sdp,
      senderId: data.senderId,
      receiverId: data.receiverId,
      groupId: data.groupId,
    });
  });

  socket.on("group:candidate", (data) => {
    if (!data.groupId || !data.candidate || !data.senderId) {
      console.error("Invalid group:candidate data:", data);
      return;
    }
    console.log(`Broadcasting group candidate: from=${data.senderId}, groupId=${data.groupId}`);
    io.to(data.groupId).emit("group:candidate", {
      candidate: data.candidate,
      senderId: data.senderId,
      groupId: data.groupId,
    });
  });

  socket.on("videoCallStarted", ({ groupId }) => {
    if (!groupId) {
      console.error("Invalid videoCallStarted data: Missing groupId");
      return;
    }
    console.log(`Group video call started in groupId ${groupId} by ${socket.user.sub}`);
    io.to(groupId).emit("videoCallStarted", { groupId });
  });

  socket.on("startVideoCall", ({ groupId }) => {
    if (!groupId) {
      console.error("Invalid startVideoCall data: Missing groupId");
      return;
    }
    console.log(`Group video call started in groupId ${groupId} by ${socket.user.sub}`);
    socket.to(groupId).emit("startVideoCall", { groupId });
  });

  socket.on("offer", ({ sdp, senderId, receiverId, groupId }) => {
    if (!sdp || !senderId || !receiverId || !groupId) {
      console.error("Invalid offer data:", { sdp, senderId, receiverId, groupId });
      return;
    }
    console.log(`Received offer: from=${senderId}, to=${receiverId}, groupId=${groupId}`);
    io.to(receiverId).emit("offer", {
      sdp,
      senderId,
      receiverId,
      groupId,
    });
    console.log(`Sent offer to ${receiverId}`);
  });

  socket.on("answer", ({ sdp, senderId, receiverId, groupId }) => {
    if (!sdp || !senderId || !receiverId || !groupId) {
      console.error("Invalid answer data:", { sdp, senderId, receiverId, groupId });
      return;
    }
    console.log(`Received answer: from=${senderId}, to=${receiverId}, groupId=${groupId}`);
    io.to(receiverId).emit("answer", {
      sdp,
      senderId,
      receiverId,
      groupId,
    });
    console.log(`Sent answer to ${receiverId}`);
  });

  socket.on("candidate", ({ candidate, senderId, groupId }) => {
    if (!candidate || !senderId || !groupId) {
      console.error("Invalid candidate data:", { candidate, senderId, groupId });
      return;
    }
    console.log(`Received candidate: from=${senderId}, groupId=${groupId}`);
    socket.to(groupId).emit("candidate", {
      candidate,
      senderId,
      groupId,
    });
    console.log(`Sent candidate to group ${groupId}`);
  });

  socket.on("videoCallEnded", ({ groupId }) => {
    if (!groupId) {
      console.error("Invalid videoCallEnded data: Missing groupId");
      return;
    }
    console.log(`Group video call ended in groupId ${groupId} by ${socket.user.sub}`);
    socket.to(groupId).emit("videoCallEnded", { groupId });
  });
});

// Start the Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});