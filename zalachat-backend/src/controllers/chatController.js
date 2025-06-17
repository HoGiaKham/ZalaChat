import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "../config/aws.js";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";

const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION,
});

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

const saveMessage = async (message) => {
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

const getConversations = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    console.warn("Get conversations failed: No access token provided");
    return res.status(401).json({ error: "Yêu cầu access token" });
  }

  let userId;
  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    userId = userData.Username;

    // Lấy toàn bộ danh sách bạn bè
    const friendParams = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    };
    const friendResult = await dynamoDBClient.send(new QueryCommand(friendParams));
    const friends = friendResult.Items;

    const conversations = await Promise.all(
      friends.map(async (item) => {
        let conversationId = item.conversationId;
        if (!conversationId) {
          const friendCheckParams = {
            TableName: process.env.DYNAMODB_TABLE_FRIENDS,
            KeyConditionExpression: "userId = :fid and friendId = :uid",
            ExpressionAttributeValues: { ":fid": item.friendId, ":uid": userId },
          };
          const friendCheckResult = await dynamoDBClient.send(new QueryCommand(friendCheckParams));
          if (friendCheckResult.Items.length > 0 && friendCheckResult.Items[0].conversationId) {
            conversationId = friendCheckResult.Items[0].conversationId;
          } else {
            conversationId = uuidv4();
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
        }

        let friendName = item.friendName;
        if (!friendName) {
          try {
            const friendData = await cognitoISP.adminGetUser({
              UserPoolId: process.env.COGNITO_USER_POOL_ID,
              Username: item.friendId,
            }).promise();
            friendName = friendData.UserAttributes.find(attr => attr.Name === "name")?.Value || item.friendId;
            await dynamoDBClient.send(
              new UpdateCommand({
                TableName: process.env.DYNAMODB_TABLE_FRIENDS,
                Key: { userId: userId, friendId: item.friendId },
                UpdateExpression: "set friendName = :fn",
                ExpressionAttributeValues: { ":fn": friendName },
              })
            );
          } catch (error) {
            console.error(`Error fetching friend ${item.friendId} name:`, error.message);
            friendName = item.friendId;
          }
        }

        const lastMessageParams = {
          TableName: process.env.DYNAMODB_TABLE_MESSAGES,
          KeyConditionExpression: "conversationId = :cid",
          ExpressionAttributeValues: { ":cid": conversationId },
          ScanIndexForward: false,
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

const getMessages = async (req, res) => {
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

const getLastMessages = async (req, res) => {
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

const getUserProfileById = async (req, res) => {
  const { userId } = req.params;
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    console.warn(`Get user profile failed for user ${userId}: No access token provided`);
    return res.status(401).json({ error: "Yêu cầu access token" });
  }
  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const currentUserId = userData.Username;
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

export { checkConversationAccess, getFriendId, saveMessage, getConversations, getMessages, getLastMessages, getUserProfileById };