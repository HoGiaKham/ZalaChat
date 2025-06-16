import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "../config/aws.js";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { Server } from "socket.io";

const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION,
});

// Socket.IO Server
let io;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  // Xác thực socket bằng Cognito token
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.warn("Socket authentication failed: No token provided");
      return next(new Error("Yêu cầu access token"));
    }
    try {
      const userData = await cognitoISP.getUser({ AccessToken: token }).promise();
      socket.userId = userData.Username;
      next();
    } catch (error) {
      console.error(`Socket authentication error for token ${token}:`, error.message);
      next(new Error("Lỗi xác thực: Token không hợp lệ"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.userId}`);

    // Tham gia tất cả các conversation của người dùng
    const joinUserConversations = async () => {
      try {
        const params = {
          TableName: process.env.DYNAMODB_TABLE_FRIENDS,
          KeyConditionExpression: "userId = :uid",
          ExpressionAttributeValues: { ":uid": socket.userId },
        };
        const result = await dynamoDBClient.send(new QueryCommand(params));
        if (!result.Items.length) {
          console.warn(`No conversations found for user ${socket.userId}`);
          return;
        }
        const conversationIds = result.Items.map(item => item.conversationId).filter(Boolean);
        conversationIds.forEach((conversationId) => {
          socket.join(conversationId);
          console.log(`User ${socket.userId} auto-joined conversation ${conversationId}`);
        });
      } catch (error) {
        console.error(`Error auto-joining conversations for user ${socket.userId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi tự động tham gia cuộc trò chuyện" });
      }
    };

    joinUserConversations();

    // Tham gia conversation cụ thể
    socket.on("joinConversation", async ({ conversationId }) => {
      try {
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to join unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền truy cập-freelancep vào cuộc trò chuyện" });
          return;
        }
        socket.join(conversationId);
        console.log(`User ${socket.userId} joined conversation ${conversationId}`);
      } catch (error) {
        console.error(`Error joining conversation ${conversationId} for user ${socket.userId}:`, error);
        socket.emit("error", { message: "Lỗi khi tham gia cuộc trò chuyện" });
      }
    });

    // Gửi tin nhắn
    socket.on("sendMessage", async (message, callback) => {
      try {
        const hasAccess = await checkConversationAccess(socket.userId, message.conversationId);
        if (!hasAccess || socket.userId !== message.senderId) {
          console.warn(`User ${socket.userId} attempted to send message to unauthorized conversation ${message.conversationId}`);
          if (callback) callback({ error: "Không có quyền gửi tin nhắn" });
          return;
        }

        const formattedMessage = {
          conversationId: message.conversationId,
          senderId: socket.userId,
          receiverId: message.receiverId,
          content: message.content,
          type: message.type || "text",
          timestamp: message.timestamp || new Date().toISOString(),
          forwardedFrom: message.forwardedFrom,
          forwardedName: message.forwardedName,
          status: "sent",
        };

        await saveMessage(formattedMessage);
        io.to(message.conversationId).emit("receiveMessage", formattedMessage);

        // Thêm sự kiện để thông báo rằng lastMessages cần được cập nhật
        io.to(message.conversationId).emit("lastMessageUpdated", {
          conversationId: message.conversationId,
          lastMessage: formattedMessage,
        });

        if (callback) callback({ status: "sent" });
        console.log(`Message sent to conversation ${message.conversationId} by ${socket.userId}:`, formattedMessage.content);
      } catch (error) {
        console.error(`Error sending message to conversation ${message.conversationId}:`, error.message);
        if (callback) callback({ error: "Lỗi khi gửi tin nhắn" });
        socket.emit("error", { message: "Lỗi khi gửi tin nhắn" });
      }
    });

    // Thu hồi tin nhắn
    socket.on("recallMessage", async ({ conversationId, timestamp }) => {
      try {
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to recall message in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền thu hồi tin nhắn" });
          return;
        }

        const params = {
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Key: { conversationId, timestamp },
          UpdateExpression: "set #type = :type, #status = :status",
          ExpressionAttributeNames: { "#type": "type", "#status": "status" },
          ExpressionAttributeValues: { ":type": "recalled", ":status": "recalled" },
        };
        await dynamoDBClient.send(new UpdateCommand(params));

        io.to(conversationId).emit("messageRecalled", { conversationId, timestamp });
        console.log(`Message recalled in conversation ${conversationId} by ${socket.userId}`);
      } catch (error) {
        console.error(`Error recalling message in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi thu hồi tin nhắn" });
      }
    });

    // Xóa tin nhắn
    socket.on("deleteMessage", async ({ conversationId, timestamp }) => {
      try {
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to delete message in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền xóa tin nhắn" });
          return;
        }

        const params = {
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          Key: { conversationId, timestamp },
          UpdateExpression: "set #status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": "deleted" },
        };
        await dynamoDBClient.send(new UpdateCommand(params));

        io.to(conversationId).emit("messageDeleted", { conversationId, timestamp });
        console.log(`Message deleted in conversation ${conversationId} by ${socket.userId}`);
      } catch (error) {
        console.error(`Error deleting message in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi xóa tin nhắn" });
      }
    });

    // Chuyển tiếp tin nhắn
    socket.on("forwardMessage", async ({ conversationId, newConversationId, content, type, forwardedFrom }) => {
      try {
        const accessChecks = await Promise.all([
          checkConversationAccess(socket.userId, conversationId),
          checkConversationAccess(socket.userId, newConversationId),
        ]);
        if (!accessChecks.every(Boolean)) {
          console.warn(`User ${socket.userId} attempted to forward message from ${conversationId} to unauthorized conversation ${newConversationId}`);
          socket.emit("error", { message: "Không có quyền chuyển tiếp tin nhắn" });
          return;
        }

        let forwardedName = forwardedFrom;
        try {
          const userData = await cognitoISP.adminGetUser({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: forwardedFrom,
          }).promise();
          forwardedName = userData.UserAttributes.find(attr => attr.Name === "name")?.Value || forwardedFrom;
        } catch (error) {
          console.error(`Error fetching forwarded user ${forwardedFrom}:`, error.message);
        }

        const friendParams = {
          TableName: process.env.DYNAMODB_TABLE_FRIENDS,
          KeyConditionExpression: "userId = :uid and conversationId = :cid",
          ExpressionAttributeValues: { ":uid": socket.userId, ":cid": newConversationId },
        };
        const friendResult = await dynamoDBClient.send(new QueryCommand(friendParams));
        if (!friendResult.Items.length) {
          console.warn(`No friend found for conversation ${newConversationId}`);
          socket.emit("error", { message: "Không tìm thấy người nhận" });
          return;
        }
        const receiverId = friendResult.Items[0].friendId;

        const message = {
          conversationId: newConversationId,
          senderId: socket.userId,
          receiverId,
          content,
          type,
          forwardedFrom,
          forwardedName,
          timestamp: new Date().toISOString(),
          status: "sent",
        };

        await saveMessage(message);
        io.to(newConversationId).emit("receiveMessage", message);
        console.log(`Message forwarded to conversation ${newConversationId} by ${socket.userId}`);
      } catch (error) {
        console.error(`Error forwarding message to conversation ${newConversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi chuyển tiếp tin nhắn" });
      }
    });

    // Thay đổi biệt hiệu (synchronized for both users)
    socket.on("nicknameChanged", async ({ conversationId, newNickname }) => {
      try {
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to change nickname in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền thay đổi biệt hiệu" });
          return;
        }

        const friendId = await getFriendId(socket.userId, conversationId);

        // Cập nhật biệt hiệu cho cả hai người dùng
        await Promise.all([
          dynamoDBClient.send(
            new UpdateCommand({
              TableName: process.env.DYNAMODB_TABLE_FRIENDS,
              Key: { userId: socket.userId, friendId },
              UpdateExpression: "set friendName = :nickname",
              ExpressionAttributeValues: { ":nickname": newNickname },
            })
          ),
          dynamoDBClient.send(
            new UpdateCommand({
              TableName: process.env.DYNAMODB_TABLE_FRIENDS,
              Key: { userId: friendId, friendId: socket.userId },
              UpdateExpression: "set friendName = :nickname",
              ExpressionAttributeValues: { ":nickname": newNickname },
            })
          ),
        ]);

        // Lưu và gửi thông báo system message
        const senderName = await getUserName(socket.userId);
        const systemMessage = {
          conversationId,
          senderId: "system",
          receiverId: friendId,
          content: `${senderName} đã đổi biệt hiệu thành ${newNickname}`,
          type: "system",
          timestamp: new Date().toISOString(),
          status: "sent",
        };
        await saveSystemMessage(systemMessage);
        io.to(conversationId).emit("receiveMessage", systemMessage);

        // Phát sự kiện nicknameChanged
        io.to(conversationId).emit("nicknameChanged", {
          conversationId,
          newNickname,
        });
        console.log(`Nickname changed to ${newNickname} in conversation ${conversationId} by ${socket.userId}`);
      } catch (error) {
        console.error(`Error changing nickname in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi thay đổi biệt hiệu" });
      }
    });

    // Thay đổi theme (synchronized for both users)
    socket.on("themeChanged", async ({ conversationId, newTheme, from }) => {
      try {
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to change theme in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền thay đổi chủ đề" });
          return;
        }

        const friendId = await getFriendId(socket.userId, conversationId);

        // Cập nhật theme cho cả hai người dùng
        await Promise.all([
          dynamoDBClient.send(
            new UpdateCommand({
              TableName: process.env.DYNAMODB_TABLE_FRIENDS,
              Key: { userId: socket.userId, friendId },
              UpdateExpression: "set theme = :theme",
              ExpressionAttributeValues: { ":theme": newTheme },
            })
          ),
          dynamoDBClient.send(
            new UpdateCommand({
              TableName: process.env.DYNAMODB_TABLE_FRIENDS,
              Key: { userId: friendId, friendId: socket.userId },
              UpdateExpression: "set theme = :theme",
              ExpressionAttributeValues: { ":theme": newTheme },
            })
          ),
        ]);

        // Lưu và gửi thông báo system message
        const senderName = await getUserName(from);
        const themeName = getThemeName(newTheme); // Hàm helper để lấy tên theme
        const systemMessage = {
          conversationId,
          senderId: "system",
          receiverId: friendId,
          content: `${senderName} đã đổi màu sắc thành ${themeName}`,
          type: "system",
          timestamp: new Date().toISOString(),
          status: "sent",
        };
        await saveSystemMessage(systemMessage);
        io.to(conversationId).emit("receiveMessage", systemMessage);

        // Phát sự kiện themeChanged
        io.to(conversationId).emit("themeChanged", {
          conversationId,
          newTheme,
          from,
        });
        console.log(`Theme changed to ${newTheme} in conversation ${conversationId} by ${socket.userId}`);
      } catch (error) {
        console.error(`Error changing theme in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi thay đổi chủ đề" });
      }
    });

    // WebRTC signaling - Call Request
    socket.on("callRequest", async ({ conversationId, to, callType }) => {
      try {
        console.log(`Call request received: from=${socket.userId}, to=${to}, conversationId=${conversationId}, callType=${callType}`);
        const callerHasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!callerHasAccess) {
          console.warn(`User ${socket.userId} attempted to call in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền thực hiện cuộc gọi" });
          return;
        }

        const receiverHasAccess = await checkConversationAccess(to, conversationId);
        if (!receiverHasAccess) {
          console.warn(`Receiver ${to} is not part of conversation ${conversationId}`);
          socket.emit("error", { message: "Người nhận không thuộc cuộc trò chuyện" });
          return;
        }

        const receiverSocket = await findUserSocket(to);
        if (!receiverSocket) {
          console.warn(`Receiver ${to} is offline for call in conversation ${conversationId}`);
          socket.emit("error", { message: "Người nhận hiện không trực tuyến" });
          return;
        }

        receiverSocket.emit("callRequest", { from: socket.userId, conversationId, callType: callType || "voice" });
        console.log(`Call request sent from ${socket.userId} to ${to} in conversation ${conversationId} (type: ${callType})`);
      } catch (error) {
        console.error(`Error processing call request in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi gửi yêu cầu gọi: " + error.message });
      }
    });

    // WebRTC signaling - Call Response
    socket.on("callResponse", async ({ to, conversationId, accepted }) => {
      try {
        console.log(`Call response received: from=${socket.userId}, to=${to}, conversationId=${conversationId}, accepted=${accepted}`);
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to respond to call in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền trả lời cuộc gọi" });
          return;
        }

        const callerSocket = await findUserSocket(to);
        if (!callerSocket) {
          console.warn(`Caller ${to} is offline for call response in conversation ${conversationId}`);
          socket.emit("error", { message: "Người gọi hiện không trực tuyến" });
          return;
        }

        callerSocket.emit("callResponse", { from: socket.userId, accepted });
        console.log(`Call response sent from ${socket.userId} to ${to} in conversation ${conversationId}: ${accepted ? "Accepted" : "Rejected"}`);
      } catch (error) {
        console.error(`Error processing call response in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi trả lời cuộc gọi: " + error.message });
      }
    });

    // WebRTC signaling - Offer
    socket.on("offer", async ({ conversationId, offer, to }) => {
      try {
        console.log(`Offer received: from=${socket.userId}, to=${to}, conversationId=${conversationId}`);
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to send offer in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền gửi offer" });
          return;
        }

        const receiverSocket = await findUserSocket(to);
        if (!receiverSocket) {
          console.warn(`Receiver ${to} is offline for offer in conversation ${conversationId}`);
          socket.emit("error", { message: "Người nhận hiện không trực tuyến" });
          return;
        }

        receiverSocket.emit("offer", { from: socket.userId, offer });
        console.log(`Offer sent from ${socket.userId} to ${to} in conversation ${conversationId}`);
      } catch (error) {
        console.error(`Error processing offer in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi gửi offer: " + error.message });
      }
    });

    // WebRTC signaling - Answer
    socket.on("answer", async ({ conversationId, answer, to }) => {
      try {
        console.log(`Answer received: from=${socket.userId}, to=${to}, conversationId=${conversationId}`);
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to send answer in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền gửi answer" });
          return;
        }

        const callerSocket = await findUserSocket(to);
        if (!callerSocket) {
          console.warn(`Caller ${to} is offline for answer in conversation ${conversationId}`);
          socket.emit("error", { message: "Người gọi hiện không trực tuyến" });
          return;
        }

        callerSocket.emit("answer", { answer });
        console.log(`Answer sent from ${socket.userId} to ${to} in conversation ${conversationId}`);
      } catch (error) {
        console.error(`Error processing answer in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi gửi answer: " + error.message });
      }
    });

    // WebRTC signaling - ICE Candidate
    socket.on("iceCandidate", async ({ conversationId, candidate, to }) => {
      try {
        console.log(`ICE candidate received: from=${socket.userId}, to=${to}, conversationId=${conversationId}`);
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to send ICE candidate in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền gửi ICE candidate" });
          return;
        }

        const receiverSocket = await findUserSocket(to);
        if (!receiverSocket) {
          console.warn(`Receiver ${to} is offline for ICE candidate in conversation ${conversationId}`);
          socket.emit("error", { message: "Người nhận hiện không trực tuyến" });
          return;
        }

        receiverSocket.emit("iceCandidate", { candidate });
        console.log(`ICE candidate sent from ${socket.userId} to ${to} in conversation ${conversationId}`);
      } catch (error) {
        console.error(`Error processing ICE candidate in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi gửi ICE candidate: " + error.message });
      }
    });

    // WebRTC signaling - Call End
    socket.on("callEnd", async ({ conversationId, to }) => {
      try {
        console.log(`Call end received: from=${socket.userId}, to=${to}, conversationId=${conversationId}`);
        const hasAccess = await checkConversationAccess(socket.userId, conversationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to end call in unauthorized conversation ${conversationId}`);
          socket.emit("error", { message: "Không có quyền kết thúc cuộc gọi" });
          return;
        }

        const receiverSocket = await findUserSocket(to);
        if (receiverSocket) {
          receiverSocket.emit("callEnd");
          console.log(`Call end sent from ${socket.userId} to ${to} in conversation ${conversationId}`);
        } else {
          console.warn(`Receiver ${to} is offline for call end in conversation ${conversationId}`);
        }
      } catch (error) {
        console.error(`Error processing call end in conversation ${conversationId}:`, error.message);
        socket.emit("error", { message: "Lỗi khi kết thúc cuộc gọi: " + error.message });
      }
    });

    // Xử lý ngắt kết nối
    socket.on("disconnect", async () => {
      console.log(`Client disconnected: ${socket.userId}`);
      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
      for (const conversationId of rooms) {
        io.to(conversationId).emit("callEnd", { from: socket.userId, reason: "User disconnected" });
        console.log(`Notified call end due to disconnect for user ${socket.userId} in conversation ${conversationId}`);
      }
    });
  });
};

// Hàm lưu system message
const saveSystemMessage = async (message) => {
  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_MESSAGES,
      Item: {
        conversationId: message.conversationId,
        timestamp: message.timestamp,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content,
        type: "system",
        status: "sent",
        createdAt: message.timestamp,
      },
    };
    await dynamoDBClient.send(new PutCommand(params));
    console.log(`Saved system message to conversation ${message.conversationId}`);
  } catch (error) {
    console.error(`Error saving system message to conversation ${message.conversationId}:`, error.message);
    throw error;
  }
};

// Hàm lấy tên theme (tương ứng với frontend)
const getThemeName = (color) => {
  const themes = [
    { color: "#007bff", name: "Mặc định" },
    { color: "#28a745", name: "Xanh lá" },
    { color: "#ff69b4", name: "Hồng" },
    { color: "#800080", name: "Tím" },
  ];
  const theme = themes.find(t => t.color === color);
  return theme ? theme.name : "Mặc định";
};

// Hàm lấy tên người dùng từ Cognito
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

// Tìm socket của người dùng dựa trên userId
const findUserSocket = async (userId) => {
  try {
    const sockets = await io.fetchSockets();
    const socket = sockets.find((s) => s.userId === userId);
    if (!socket) {
      console.warn(`No socket found for user ${userId}`);
    }
    return socket;
  } catch (error) {
    console.error(`Error finding socket for user ${userId}:`, error.message);
    return null;
  }
};

// Kiểm tra quyền truy cập conversation
const checkConversationAccess = async (userId, conversationId) => {
  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    };
    const result = await dynamoDBClient.send(new QueryCommand(params));
    const hasAccess = result.Items.some(item => item.conversationId === conversationId);
    if (!hasAccess) {
      console.warn(`User ${userId} has no access to conversation ${conversationId}`);
    }
    return hasAccess;
  } catch (error) {
    console.error(`Error checking conversation access for user ${userId} in conversation ${conversationId}:`, error.message);
    return false;
  }
};

// Lấy friendId từ conversationId
const getFriendId = async (userId, conversationId) => {
  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid and conversationId = :cid",
      ExpressionAttributeValues: { ":uid": userId, ":cid": conversationId },
    };
    const result = await dynamoDBClient.send(new QueryCommand(params));
    if (!result.Items.length) {
      console.warn(`No friend found for user ${userId} in conversation ${conversationId}`);
      throw new Error("Không tìm thấy bạn bè trong cuộc trò chuyện");
    }
    return result.Items[0].friendId;
  } catch (error) {
    console.error(`Error fetching friendId for user ${userId} in conversation ${conversationId}:`, error.message);
    throw error;
  }
};

// API lấy danh sách conversations
export const getConversations = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    console.warn("Get conversations failed: No access token provided");
    return res.status(401).json({ error: "Yêu cầu access token" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    };

    const result = await dynamoDBClient.send(new QueryCommand(params));
    if (!result.Items.length) {
      console.log(`No conversations found for user ${userId}`);
      return res.json([]);
    }

    const conversations = await Promise.all(
      result.Items.map(async (item) => {
        let conversationId = item.conversationId;

        if (!conversationId) {
          const friendParams = {
            TableName: process.env.DYNAMODB_TABLE_FRIENDS,
            KeyConditionExpression: "userId = :uid and friendId = :fid",
            ExpressionAttributeValues: { ":uid": item.friendId, ":fid": userId },
          };
          const friendResult = await dynamoDBClient.send(new QueryCommand(friendParams));

          if (friendResult.Items.length > 0 && friendResult.Items[0].conversationId) {
            conversationId = friendResult.Items[0].conversationId;
          } else {
            conversationId = uuidv4();
          }

          await Promise.all([
            dynamoDBClient.send(
              new UpdateCommand({
                TableName: process.env.DYNAMODB_TABLE_FRIENDS,
                Key: { userId: userId, friendId: item.friendId },
                UpdateExpression: "set conversationId = :cid",
                ExpressionAttributeValues: { ":cid": conversationId },
              })
            ),
            dynamoDBClient.send(
              new UpdateCommand({
                TableName: process.env.DYNAMODB_TABLE_FRIENDS,
                Key: { userId: item.friendId, friendId: userId },
                UpdateExpression: "set conversationId = :cid",
                ExpressionAttributeValues: { ":cid": conversationId },
              })
            ),
          ]);

          console.log(`Created conversationId ${conversationId} for user ${userId} and friend ${item.friendId}`);
        }

        let friendName = item.friendName;
        if (!friendName) {
          try {
            const friendData = await cognitoISP.adminGetUser({
              UserPoolId: process.env.COGNITO_USER_POOL_ID,
              Username: item.friendId,
            }).promise();
            friendName = friendData.UserAttributes.find(attr => attr.Name === "name")?.Value || item.friendId;
          } catch (error) {
            console.error(`Error fetching friend ${item.friendId} name:`, error.message);
            friendName = item.friendId;
          }
        }

        // Lấy tin nhắn cuối cùng
        const lastMessageParams = {
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          KeyConditionExpression: "conversationId = :cid",
          ExpressionAttributeValues: { ":cid": conversationId },
          ScanIndexForward: false, // Sắp xếp giảm dần
          Limit: 1,
        };
        const lastMessageResult = await dynamoDBClient.send(new QueryCommand(lastMessageParams));
        const lastMessage = lastMessageResult.Items[0] || null;

        return {
          conversationId,
          friendId: item.friendId,
          friendName,
          theme: item.theme || "#007bff",
          lastMessageTimestamp: lastMessage ? lastMessage.timestamp : null,
        };
      })
    );

    // Sắp xếp danh sách dựa trên lastMessageTimestamp
    conversations.sort((a, b) => {
      const timestampA = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
      const timestampB = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
      return timestampB - timestampA;
    });

    console.log(`Fetched ${conversations.length} conversations for user ${userId}`);
    res.json(conversations);
  } catch (error) {
    console.error(`Error fetching conversations for user ${userId}:`, error.message);
    res.status(500).json({ error: "Lỗi server khi lấy danh sách cuộc trò chuyện: " + error.message });
  }
};

// API lưu tin nhắn
export const saveMessage = async (message) => {
  try {
    const hasAccess = await checkConversationAccess(message.senderId, message.conversationId);
    if (!hasAccess) {
      console.warn(`User ${message.senderId} attempted to save message to unauthorized conversation ${message.conversationId}`);
      throw new Error("Không có quyền gửi tin nhắn");
    }

    const params = {
      TableName: process.env.DYNAMODB_TABLE_MESSAGES,
      Item: {
        conversationId: message.conversationId,
        timestamp: message.timestamp,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content,
        type: message.type || "text",
        forwardedFrom: message.forwardedFrom,
        forwardedName: message.forwardedName,
        status: message.status || "sent",
        createdAt: message.timestamp,
      },
    };

    await dynamoDBClient.send(new PutCommand(params));
    console.log(`Saved message to conversation ${message.conversationId} by ${message.senderId}`);
  } catch (error) {
    console.error(`Error saving message to conversation ${message.conversationId}:`, error.message);
    throw error;
  }
};

// API lấy tin nhắn
export const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { limit, sort = "asc" } = req.query;

  if (!accessToken) {
    console.warn(`Get messages failed for conversation ${conversationId}: No access token provided`);
    return res.status(401).json({ error: "Yêu cầu access token" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const hasAccess = await checkConversationAccess(userId, conversationId);
    if (!hasAccess) {
      console.warn(`User ${userId} has no access to conversation ${conversationId}`);
      return res.status(403).json({ error: "Không có quyền truy cập cuộc trò chuyện này" });
    }

    const params = {
      TableName: process.env.DYNAMODB_TABLE_MESSAGES,
      KeyConditionExpression: "conversationId = :cid",
      ExpressionAttributeValues: { ":cid": conversationId },
      ScanIndexForward: sort === "asc",
    };

    if (limit) params.Limit = parseInt(limit);

    const result = await dynamoDBClient.send(new QueryCommand(params));
    console.log(`Fetched ${result.Items.length} messages for conversation ${conversationId}`);

    const messages = await Promise.all(
      result.Items.map(async (msg) => {
        if (msg.forwardedFrom && !msg.forwardedName) {
          try {
            const userData = await cognitoISP.adminGetUser({
              UserPoolId: process.env.COGNITO_USER_POOL_ID,
              Username: msg.forwardedFrom,
            }).promise();
            msg.forwardedName = userData.UserAttributes.find(attr => attr.Name === "name")?.Value || msg.forwardedFrom;
          } catch (error) {
            console.error(`Error fetching forwarded user ${msg.forwardedFrom}:`, error.message);
          }
        }
        return msg;
      })
    );

    res.json(messages);
  } catch (error) {
    console.error(`Error fetching messages for conversation ${conversationId}:`, error.message);
    res.status(500).json({ error: "Lỗi server khi lấy tin nhắn: " + error.message });
  }
};

// API lấy tin nhắn cuối cùng
export const getLastMessages = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    console.warn("Get last messages failed: No access token provided");
    return res.status(401).json({ error: "Yêu cầu access token" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const friendParams = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    };
    const friendResult = await dynamoDBClient.send(new QueryCommand(friendParams));
    const conversationIds = friendResult.Items.map(item => item.conversationId).filter(Boolean);

    if (!conversationIds.length) {
      console.log(`No conversations found for user ${userId}`);
      return res.json({});
    }

    const lastMessages = {};
    await Promise.all(
      conversationIds.map(async (conversationId) => {
        const params = {
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          KeyConditionExpression: "conversationId = :cid",
          ExpressionAttributeValues: { ":cid": conversationId },
          ScanIndexForward: false,
          Limit: 1,
        };
        const result = await dynamoDBClient.send(new QueryCommand(params));
        if (result.Items.length > 0) {
          const msg = result.Items[0];
          if (msg.forwardedFrom && !msg.forwardedName) {
            try {
              const userData = await cognitoISP.adminGetUser({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: msg.forwardedFrom,
              }).promise();
              msg.forwardedName = userData.UserAttributes.find(attr => attr.Name === "name")?.Value || msg.forwardedFrom;
            } catch (error) {
              console.error(`Error fetching forwarded user ${msg.forwardedFrom}:`, error.message);
            }
          }
          lastMessages[conversationId] = msg;
        }
      })
    );

    console.log(`Fetched ${Object.keys(lastMessages).length} last messages for ${conversationIds.length} conversations for user ${userId}`);
    res.json(lastMessages);
  } catch (error) {
    console.error(`Error fetching last messages for user ${userId}:`, error.message);
    res.status(500).json({ error: "Lỗi server khi lấy tin nhắn cuối cùng: " + error.message });
  }
};

// API lấy thông tin người dùng
export const getUserProfileById = async (req, res) => {
  const { userId } = req.params;
  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    console.warn(`Get user profile failed for user ${userId}: No access token provided`);
    return res.status(401).json({ error: "Yêu cầu access token" });
  }

  try {
    // Xác thực người dùng hiện tại
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const currentUserId = userData.Username;

    // Kiểm tra quyền truy cập (chỉ bạn bè hoặc chính người dùng mới xem được profile)
    const friendParams = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": currentUserId },
    };
    const friendResult = await dynamoDBClient.send(new QueryCommand(friendParams));
    const isFriend = friendResult.Items.some(item => item.friendId === userId);

    if (!isFriend && currentUserId !== userId) {
      console.warn(`User ${currentUserId} attempted to access profile of non-friend ${userId}`);
      return res.status(403).json({ error: "Không có quyền xem thông tin người dùng này" });
    }

    // Lấy thông tin profile từ Cognito
    const userDataProfile = await cognitoISP.adminGetUser({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: userId,
    }).promise();
    const attributes = userDataProfile.UserAttributes.reduce((acc, attr) => {
      acc[attr.Name] = attr.Value;
      return acc;
    }, {});
    const profile = {
      name: attributes.name || userId,
      email: attributes.email || "Không có email",
      phoneNumber: attributes.phone_number || "Chưa cung cấp",
    };

    console.log(`Fetched profile for user ${userId} by ${currentUserId}`);
    res.json(profile);
  } catch (error) {
    console.error(`Error fetching profile for user ${userId}:`, error.message);
    res.status(500).json({ error: "Lỗi server khi lấy thông tin người dùng: " + error.message });
  }
};