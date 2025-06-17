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
import { PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/upload", uploadRoutes);

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

const getFileType = (url) => {
  if (!url) return "file";
  if (/\.(jpg|jpeg|png|gif)$/i.test(url)) return "image";
  if (/\.(mp3|wav|ogg|webm)$/i.test(url)) return "audio";
  if (/\.(mp4|avi|mkv|mov)$/i.test(url)) return "video";
  return "file";
};

const checkConversationAccess = async (userId, conversationId) => {
  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    };
    const result = await dynamoDBClient.send(new QueryCommand(params));
    return result.Items.some(item => item.conversationId === conversationId);
  } catch (error) {
    console.error(`Error checking conversation access for user ${userId}:`, error.message);
    return false;
  }
};

const getUserName = async (userId) => {
  try {
    const userData = await cognitoISP.adminGetUser({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: userId,
    }).promise();
    return userData.UserAttributes.find(attr => attr.Name === "name")?.Value || userId;
  } catch (error) {
    console.error(`Error fetching user ${userId} name:`, error.message);
    return userId;
  }
};

const getFriendId = async (userId, conversationId) => {
  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid and conversationId = :cid",
      ExpressionAttributeValues: { ":uid": userId, ":cid": conversationId },
    };
    const result = await dynamoDBClient.send(new QueryCommand(params));
    if (!result.Items.length) {
      throw new Error("No friend found in conversation");
    }
    return result.Items[0].friendId;
  } catch (error) {
    console.error(`Error fetching friendId for user ${userId} in conversation ${conversationId}:`, error.message);
    throw error;
  }
};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.sub} (Socket ID: ${socket.id})`);

  socket.on("connect_error", (error) => {
    console.error(`Socket.IO connection error for user ${socket.user.sub}:`, error.message);
    socket.emit("error", { message: "Lỗi kết nối: " + error.message });
  });

  socket.join(socket.user.sub);
  console.log(`User ${socket.user.sub} joined personal room: ${socket.user.sub}`);

  socket.on("joinConversation", async ({ conversationId }) => {
    if (!conversationId) {
      console.error("Invalid conversationId in joinConversation");
      socket.emit("error", { message: "Invalid conversationId" });
      return;
    }
    const hasAccess = await checkConversationAccess(socket.user.sub, conversationId);
    if (!hasAccess) {
      console.error(`User ${socket.user.sub} has no access to conversation ${conversationId}`);
      socket.emit("error", { message: "Không có quyền truy cập cuộc trò chuyện" });
      return;
    }
    socket.join(conversationId);
    console.log(`User ${socket.user.sub} joined conversation: ${conversationId}`);
  });

  socket.on("joinGroup", ({ groupId }) => {
    if (!groupId) {
      console.error("Invalid groupId in joinGroup");
      socket.emit("error", { message: "Invalid groupId" });
      return;
    }
    socket.join(groupId);
    console.log(`User ${socket.user.sub} joined group: ${groupId}`);
  });

  socket.on("sendMessage", async (message, callback) => {
    try {
      if (!message.conversationId || !message.content || !message.senderId || message.senderId !== socket.user.sub) {
        throw new Error("Invalid message data: Missing or invalid fields");
      }
      const hasAccess = await checkConversationAccess(socket.user.sub, message.conversationId);
      if (!hasAccess) {
        throw new Error("Không có quyền gửi tin nhắn");
      }
      const messageId = uuidv4();
      const messageData = {
        conversationId: message.conversationId,
        messageId,
        senderId: socket.user.sub,
        receiverId: message.receiverId,
        content: message.content,
        type: message.type || "text",
        timestamp: message.timestamp || new Date().toISOString(),
        status: "sent",
      };
      await dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Item: messageData,
        })
      );
      console.log(`Emitting message to conversation ${message.conversationId}:`, messageData);
      io.to(message.conversationId).emit("receiveMessage", messageData);
      io.to(message.conversationId).emit("lastMessageUpdated", {
        conversationId: message.conversationId,
        lastMessage: messageData,
      });
      if (callback) callback({ status: "sent", messageId });
    } catch (error) {
      console.error("Error saving message:", error.message);
      socket.emit("error", { message: "Lỗi khi gửi tin nhắn: " + error.message });
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("recallMessage", async ({ conversationId, timestamp }) => {
    try {
      if (!conversationId || !timestamp) {
        throw new Error("Invalid recall data: Missing conversationId or timestamp");
      }
      const hasAccess = await checkConversationAccess(socket.user.sub, conversationId);
      if (!hasAccess) {
        throw new Error("Không có quyền thu hồi tin nhắn");
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
      socket.emit("error", { message: "Lỗi khi thu hồi tin nhắn: " + error.message });
    }
  });

  socket.on("deleteMessage", async ({ conversationId, timestamp }) => {
    try {
      if (!conversationId || !timestamp) {
        throw new Error("Invalid delete data: Missing conversationId or timestamp");
      }
      const hasAccess = await checkConversationAccess(socket.user.sub, conversationId);
      if (!hasAccess) {
        throw new Error("Không có quyền xóa tin nhắn");
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
      socket.emit("error", { message: "Lỗi khi xóa tin nhắn: " + error.message });
    }
  });

  socket.on("forwardMessage", async ({ conversationId, newConversationId, content, type, forwardedFrom, forwardedName }) => {
    try {
      if (!newConversationId || !content) {
        throw new Error("Invalid forward data: Missing newConversationId or content");
      }
      const accessChecks = await Promise.all([
        checkConversationAccess(socket.user.sub, conversationId),
        checkConversationAccess(socket.user.sub, newConversationId),
      ]);
      if (!accessChecks.every(Boolean)) {
        throw new Error("Không có quyền chuyển tiếp tin nhắn");
      }
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      const friendParams = {
        TableName: process.env.DYNAMODB_TABLE_FRIENDS,
        KeyConditionExpression: "userId = :uid and conversationId = :cid",
        ExpressionAttributeValues: { ":uid": socket.user.sub, ":cid": newConversationId },
      };
      const friendResult = await dynamoDBClient.send(new QueryCommand(friendParams));
      if (!friendResult.Items.length) {
        throw new Error("Không tìm thấy người nhận");
      }
      const receiverId = friendResult.Items[0].friendId;
      const newMessage = {
        conversationId: newConversationId,
        messageId,
        senderId: socket.user.sub,
        receiverId,
        content,
        type,
        forwardedFrom,
        forwardedName,
        timestamp,
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
      io.to(newConversationId).emit("lastMessageUpdated", { conversationId: newConversationId, lastMessage: newMessage });
    } catch (error) {
      console.error("Error forwarding message:", error.message);
      socket.emit("error", { message: "Lỗi khi chuyển tiếp tin nhắn: " + error.message });
    }
  });

  socket.on("markAsRead", async ({ conversationId, userId }) => {
    try {
      if (!conversationId || !userId || userId !== socket.user.sub) {
        throw new Error("Invalid markAsRead data: Missing or invalid fields");
      }
      const hasAccess = await checkConversationAccess(socket.user.sub, conversationId);
      if (!hasAccess) {
        throw new Error("Không có quyền đánh dấu tin nhắn đã đọc");
      }
      const params = {
        TableName: process.env.DYNAMODB_TABLE_MESSAGES,
        KeyConditionExpression: "conversationId = :cid",
        ExpressionAttributeValues: { ":cid": conversationId },
      };
      const result = await dynamoDBClient.send(new QueryCommand(params));
      await Promise.all(
        result.Items.map(async (msg) => {
          if (!msg.readBy || !msg.readBy.includes(userId)) {
            await dynamoDBClient.send(
              new UpdateCommand({
                TableName: process.env.DYNAMODB_TABLE_MESSAGES,
                Key: { conversationId, timestamp: msg.timestamp },
                UpdateExpression: "set readBy = list_append(if_not_exists(readBy, :empty_list), :userId)",
                ExpressionAttributeValues: {
                  ":userId": [userId],
                  ":empty_list": [],
                },
              })
            );
          }
        })
      );
      console.log(`Marked messages as read for conversation ${conversationId} by user ${userId}`);
      io.to(conversationId).emit("messagesRead", { conversationId, userId });
    } catch (error) {
      console.error("Error marking messages as read:", error.message);
      socket.emit("error", { message: "Lỗi khi đánh dấu tin nhắn đã đọc: " + error.message });
    }
  });

  socket.on("themeChanged", async ({ conversationId, newTheme, from }) => {
    try {
      if (!conversationId || !newTheme || from !== socket.user.sub) {
        throw new Error("Invalid theme change data");
      }
      const hasAccess = await checkConversationAccess(socket.user.sub, conversationId);
      if (!hasAccess) {
        throw new Error("Không có quyền thay đổi chủ đề");
      }
      const friendId = await getFriendId(socket.user.sub, conversationId);
      await Promise.all([
        dynamoDBClient.send(
          new UpdateCommand({
            TableName: process.env.DYNAMODB_TABLE_FRIENDS,
            Key: { userId: socket.user.sub, friendId },
            UpdateExpression: "set theme = :theme",
            ExpressionAttributeValues: { ":theme": newTheme },
          })
        ),
        dynamoDBClient.send(
          new UpdateCommand({
            TableName: process.env.DYNAMODB_TABLE_FRIENDS,
            Key: { userId: friendId, friendId: socket.user.sub },
            UpdateExpression: "set theme = :theme",
            ExpressionAttributeValues: { ":theme": newTheme },
          })
        ),
      ]);
      const senderName = await getUserName(from);
      const themeName = ["#007bff", "#28a745", "#ff69b4", "#800080"].includes(newTheme) ? newTheme : "Mặc định";
      const systemMessage = {
        conversationId,
        messageId: uuidv4(),
        senderId: "system",
        receiverId: friendId,
        content: `${senderName} đã đổi màu sắc thành ${themeName}`,
        type: "system",
        timestamp: new Date().toISOString(),
        status: "sent",
      };
      await dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Item: systemMessage,
        })
      );
      io.to(conversationId).emit("receiveMessage", systemMessage);
      io.to(conversationId).emit("themeChanged", { conversationId, newTheme, from });
      console.log(`Theme changed to ${newTheme} in conversation ${conversationId} by ${socket.user.sub}`);
    } catch (error) {
      console.error("Error changing theme:", error.message);
      socket.emit("error", { message: "Lỗi khi thay đổi chủ đề: " + error.message });
    }
  });

  socket.on("nicknameChanged", async ({ conversationId, newNickname }) => {
    try {
      if (!conversationId || !newNickname) {
        throw new Error("Invalid nickname change data");
      }
      const hasAccess = await checkConversationAccess(socket.user.sub, conversationId);
      if (!hasAccess) {
        throw new Error("Không có quyền thay đổi biệt hiệu");
      }
      const friendId = await getFriendId(socket.user.sub, conversationId);
      await Promise.all([
        dynamoDBClient.send(
          new UpdateCommand({
            TableName: process.env.DYNAMODB_TABLE_FRIENDS,
            Key: { userId: socket.user.sub, friendId },
            UpdateExpression: "set friendName = :nickname",
            ExpressionAttributeValues: { ":nickname": newNickname },
          })
        ),
        dynamoDBClient.send(
          new UpdateCommand({
            TableName: process.env.DYNAMODB_TABLE_FRIENDS,
            Key: { userId: friendId, friendId: socket.user.sub },
            UpdateExpression: "set friendName = :nickname",
            ExpressionAttributeValues: { ":nickname": newNickname },
          })
        ),
      ]);
      const senderName = await getUserName(socket.user.sub);
      const systemMessage = {
        conversationId,
        messageId: uuidv4(),
        senderId: "system",
        receiverId: friendId,
        content: `${senderName} đã đổi biệt hiệu thành ${newNickname}`,
        type: "system",
        timestamp: new Date().toISOString(),
        status: "sent",
      };
      await dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Item: systemMessage,
        })
      );
      io.to(conversationId).emit("receiveMessage", systemMessage);
      io.to(conversationId).emit("nicknameChanged", { conversationId, newNickname });
      console.log(`Nickname changed to ${newNickname} in conversation ${conversationId} by ${socket.user.sub}`);
    } catch (error) {
      console.error("Error changing nickname:", error.message);
      socket.emit("error", { message: "Lỗi khi thay đổi biệt hiệu: " + error.message });
    }
  });

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
      socket.emit("error", { message: "Lỗi khi gửi tin nhắn nhóm: " + error.message });
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
      socket.emit("error", { message: "Lỗi khi thu hồi tin nhắn nhóm: " + error.message });
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
      socket.emit("error", { message: "Lỗi khi xóa tin nhắn nhóm: " + error.message });
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
      socket.emit("error", { message: "Lỗi khi chuyển tiếp tin nhắn nhóm: " + error.message });
    }
  });

  socket.on("callRequest", ({ conversationId, to, callType }) => {
    if (!conversationId || !to || !callType) {
      console.error("Invalid callRequest data:", { conversationId, to, callType });
      socket.emit("error", { message: "Invalid call request data" });
      return;
    }
    if (to === socket.user.sub) {
      console.error("Error: Cannot call self");
      socket.emit("error", { message: "Cannot call yourself" });
      return;
    }
    console.log(`Received callRequest: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}, callType=${callType}`);
    io.to(to).emit("callRequest", {
      from: socket.user.sub,
      conversationId,
      callType,
    });
  });

  socket.on("callResponse", ({ to, conversationId, accepted }) => {
    if (!to || !conversationId || typeof accepted !== "boolean") {
      console.error("Invalid callResponse data:", { to, conversationId, accepted });
      socket.emit("error", { message: "Invalid call response data" });
      return;
    }
    console.log(`Received callResponse: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}, accepted=${accepted}`);
    io.to(to).emit("callResponse", {
      from: socket.user.sub,
      conversationId,
      accepted,
    });
  });

  socket.on("call:offer", ({ to, conversationId, offer }) => {
    if (!to || !conversationId || !offer) {
      console.error("Invalid call offer data:", { to, conversationId, offer });
      socket.emit("error", { message: "Invalid call offer data" });
      return;
    }
    console.log(`Received call offer: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("offer", {
      from: socket.user.sub,
      conversationId,
      offer,
    });
  });

  socket.on("call:answer", ({ to, conversationId, answer }) => {
    if (!to || !conversationId || !answer) {
      console.error("Invalid call answer data:", { to, conversationId, answer });
      socket.emit("error", { message: "Invalid call answer data" });
      return;
    }
    console.log(`Received call answer: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("answer", {
      from: socket.user.sub,
      conversationId,
      answer,
    });
  });

  socket.on("iceCandidate", ({ to, conversationId, candidate }) => {
    if (!to || !conversationId || !candidate) {
      console.error("Invalid iceCandidate data:", { to, conversationId, candidate });
      socket.emit("error", { message: "Invalid ICE candidate data" });
      return;
    }
    console.log(`Received iceCandidate: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("iceCandidate", {
      from: socket.user.sub,
      conversationId,
      candidate,
    });
  });

  socket.on("callEnd", ({ to, conversationId }) => {
    if (!to || !conversationId) {
      console.error("Invalid callEnd data:", { to, conversationId });
      socket.emit("error", { message: "Invalid call end data" });
      return;
    }
    console.log(`Received callEnd: from=${socket.user.sub}, to=${to}, conversationId=${conversationId}`);
    io.to(to).emit("callEnd", {
      from: socket.user.sub,
      conversationId,
    });
  });

  socket.on("group:offer", (data) => {
    if (!data.groupId || !data.sdp || !data.senderId) {
      console.error("Invalid group:offer data:", data);
      socket.emit("error", { message: "Invalid group offer data" });
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
      socket.emit("error", { message: "Invalid group answer data" });
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
      socket.emit("error", { message: "Invalid group candidate data" });
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
      socket.emit("error", { message: "Invalid video call start data" });
      return;
    }
    console.log(`Group video call started in groupId ${groupId} by ${socket.user.sub}`);
    io.to(groupId).emit("videoCallStarted", { groupId });
  });

  socket.on("startVideoCall", ({ groupId }) => {
    if (!groupId) {
      console.error("Invalid startVideoCall data: Missing groupId");
      socket.emit("error", { message: "Invalid video call start data" });
      return;
    }
    console.log(`Group video call started in groupId ${groupId} by ${socket.user.sub}`);
    socket.to(groupId).emit("startVideoCall", { groupId });
  });

  socket.on("offer", ({ sdp, senderId, receiverId, groupId }) => {
    if (!sdp || !senderId || !receiverId || !groupId) {
      console.error("Invalid offer data:", { sdp, senderId, receiverId, groupId });
      socket.emit("error", { message: "Invalid offer data" });
      return;
    }
    console.log(`Received offer: from=${senderId}, to=${receiverId}, groupId=${groupId}`);
    io.to(receiverId).emit("offer", {
      sdp,
      senderId,
      receiverId,
      groupId,
    });
  });

  socket.on("answer", ({ sdp, senderId, receiverId, groupId }) => {
    if (!sdp || !senderId || !receiverId || !groupId) {
      console.error("Invalid answer data:", { sdp, senderId, receiverId, groupId });
      socket.emit("error", { message: "Invalid answer data" });
      return;
    }
    console.log(`Received answer: from=${senderId}, to=${receiverId}, groupId=${groupId}`);
    io.to(receiverId).emit("answer", {
      sdp,
      senderId,
      receiverId,
      groupId,
    });
  });

  socket.on("candidate", ({ candidate, senderId, groupId }) => {
    if (!candidate || !senderId || !groupId) {
      console.error("Invalid candidate data:", { candidate, senderId, groupId });
      socket.emit("error", { message: "Invalid candidate data" });
      return;
    }
    console.log(`Received candidate: from=${senderId}, groupId=${groupId}`);
    socket.to(groupId).emit("candidate", {
      candidate,
      senderId,
      groupId,
    });
  });
socket.on("reactMessage", async ({ conversationId, messageId, reaction }) => {
  try {
    if (!conversationId || !messageId) {
      throw new Error("Invalid reaction data");
    }
    const hasAccess = await checkConversationAccess(socket.user.sub, conversationId);
    if (!hasAccess) {
      throw new Error("Không có quyền thêm phản ứng");
    }
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: process.env.DYNAMODB_TABLE_MESSAGES,
        Key: { conversationId, messageId },
        UpdateExpression: "set reaction = :reaction",
        ExpressionAttributeValues: { ":reaction": reaction || null },
      })
    );
    io.to(conversationId).emit("messageReacted", { conversationId, messageId, reaction });
  } catch (error) {
    console.error("Error reacting to message:", error.message);
    socket.emit("error", { message: "Lỗi khi thêm phản ứng: " + error.message });
  }
});
  socket.on("videoCallEnded", ({ groupId }) => {
    if (!groupId) {
      console.error("Invalid videoCallEnded data: Missing groupId");
      socket.emit("error", { message: "Invalid video call end data" });
      return;
    }
    console.log(`Group video call ended in groupId ${groupId} by ${socket.user.sub}`);
    socket.to(groupId).emit("videoCallEnded", { groupId });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user.sub} (Socket ID: ${socket.id})`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});