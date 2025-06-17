import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "../config/aws.js";
import AWS from "aws-sdk";

const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION,
});

export const sendFriendRequest = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { receiverEmail } = req.body;

  if (!accessToken || !receiverEmail) {
    return res.status(400).json({ error: "Yêu cầu access token và email người nhận" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const senderId = userData.Username;
    const senderName = userData.UserAttributes.find((attr) => attr.Name === "name")?.Value || senderId;

    const receiverData = await cognitoISP
      .adminGetUser({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: receiverEmail,
      })
      .promise()
      .catch(() => null);
    if (!receiverData) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }
    const receiverId = receiverData.Username;
    const receiverName = receiverData.UserAttributes.find((attr) => attr.Name === "name")?.Value || receiverId;

    if (senderId === receiverId) {
      return res.status(400).json({ error: "Không thể gửi lời mời kết bạn cho chính bạn" });
    }

    const friendCheck = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_FRIENDS,
        KeyConditionExpression: "userId = :uid AND friendId = :fid",
        ExpressionAttributeValues: {
          ":uid": senderId,
          ":fid": receiverId,
        },
      })
    );
    if (friendCheck.Items.length > 0) {
      return res.status(400).json({ error: "Đã là bạn bè" });
    }

    const requestId = `${senderId}_${receiverId}_${Date.now()}`; // Thêm timestamp để tránh trùng lặp
    const requestCheck = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
        KeyConditionExpression: "receiverId = :rid AND requestId = :reqid",
        ExpressionAttributeValues: {
          ":rid": receiverId,
          ":reqid": requestId,
        },
      })
    );
    if (requestCheck.Items.length > 0 && requestCheck.Items[0].status === "pending") {
      return res.status(400).json({ error: "Lời mời kết bạn đã được gửi trước đó" });
    }

    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
      Item: {
        receiverId,
        requestId,
        senderId,
        senderName,
        status: "pending",
        timestamp: new Date().toISOString(),
      },
    };

    await dynamoDBClient.send(new PutCommand(params));
    res.status(200).json({ success: true, message: "Gửi lời mời kết bạn thành công", friendSub: receiverId });

    // Phát sự kiện cho người nhận và người gửi
    global.io.to(receiverId).emit("receiveFriendRequest", { senderId, senderName });
    global.io.to(senderId).emit("friendRequestSent", { receiverId, receiverName });
  } catch (error) {
    console.error("Lỗi khi gửi lời mời kết bạn:", error);
    res.status(400).json({ error: error.message || "Không thể gửi lời mời kết bạn" });
  }
};

export const getFriendRequests = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    return res.status(401).json({ error: "Yêu cầu access token" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const receiverId = userData.Username;

    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
      IndexName: "ReceiverIdIndex", // Giả định có index cho receiverId
      KeyConditionExpression: "receiverId = :rid",
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":rid": receiverId,
        ":status": "pending",
      },
    };

    const result = await dynamoDBClient.send(new QueryCommand(params));
    const requests = result.Items.map((item) => ({
      requestId: item.requestId,
      senderId: item.senderId,
      senderName: item.senderName,
      timestamp: item.timestamp,
    }));
    res.status(200).json(requests);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách lời mời kết bạn:", error);
    res.status(400).json({ error: error.message || "Không thể lấy danh sách lời mời kết bạn" });
  }
};

export const acceptFriendRequest = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { requestId } = req.body;

  if (!accessToken || !requestId) {
    return res.status(400).json({ error: "Yêu cầu access token và requestId" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const receiverId = userData.Username;
    const receiverName = userData.UserAttributes.find((attr) => attr.Name === "name")?.Value || receiverId;
    const [senderId] = requestId.split("_"); // Lấy senderId từ requestId

    const requestCheck = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
        KeyConditionExpression: "receiverId = :rid AND requestId = :reqid",
        ExpressionAttributeValues: {
          ":rid": receiverId,
          ":reqid": requestId,
        },
      })
    );
    if (requestCheck.Items.length === 0 || requestCheck.Items[0].status !== "pending") {
      return res.status(400).json({ error: "Yêu cầu không hợp lệ hoặc đã được xử lý" });
    }

    const senderData = await cognitoISP
      .adminGetUser({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: senderId,
      })
      .promise();
    const senderName = senderData.UserAttributes.find((attr) => attr.Name === "name")?.Value || senderId;

    const timestamp = new Date().toISOString();
    const newFriendReceiver = { friendId: senderId, friendName: senderName, timestamp };
    const newFriendSender = { friendId: receiverId, friendName: receiverName, timestamp };

    await Promise.all([
      dynamoDBClient.send(
        new UpdateCommand({
          TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
          Key: { receiverId, requestId },
          UpdateExpression: "set #status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": "accepted" },
        })
      ),
      dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_FRIENDS,
          Item: {
            userId: receiverId,
            ...newFriendReceiver,
          },
        })
      ),
      dynamoDBClient.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_FRIENDS,
          Item: {
            userId: senderId,
            ...newFriendSender,
          },
        })
      ),
    ]);

    res.status(200).json({ success: true, message: "Chấp nhận lời mời kết bạn thành công", friendSub: senderId });

    // Phát sự kiện cho cả hai bên
    global.io.to(senderId).emit("friendRequestAcceptedClient", newFriendReceiver);
    global.io.to(receiverId).emit("friendAdded", newFriendSender);
    global.io.emit("friendListUpdated", { userSub: receiverId, action: "accept", friendSub: senderId });
    global.io.emit("friendListUpdated", { userSub: senderId, action: "accept", friendSub: receiverId });
  } catch (error) {
    console.error("Lỗi khi chấp nhận lời mời kết bạn:", error);
    res.status(400).json({ error: error.message || "Không thể chấp nhận lời mời kết bạn" });
  }
};

export const rejectFriendRequest = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { requestId } = req.body;

  if (!accessToken || !requestId) {
    return res.status(400).json({ error: "Yêu cầu access token và requestId" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const receiverId = userData.Username;
    const [senderId] = requestId.split("_");

    const requestCheck = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
        KeyConditionExpression: "receiverId = :rid AND requestId = :reqid",
        ExpressionAttributeValues: {
          ":rid": receiverId,
          ":reqid": requestId,
        },
      })
    );
    if (requestCheck.Items.length === 0 || requestCheck.Items[0].status !== "pending") {
      return res.status(400).json({ error: "Yêu cầu không hợp lệ hoặc đã được xử lý" });
    }

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
        Key: { receiverId, requestId },
        UpdateExpression: "set #status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": "rejected" },
      })
    );

    res.status(200).json({ success: true, message: "Từ chối lời mời kết bạn thành công" });

    global.io.to(senderId).emit("friendRequestRejectedClient", { receiverId });
    global.io.emit("friendListUpdated", { userSub: receiverId, action: "reject", friendSub: senderId });
  } catch (error) {
    console.error("Lỗi khi từ chối lời mời kết bạn:", error);
    res.status(400).json({ error: error.message || "Không thể từ chối lời mời kết bạn" });
  }
};

export const getFriends = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    return res.status(401).json({ error: "Yêu cầu access token" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const params = {
      TableName: process.env.DYNAMODB_TABLE_FRIENDS,
      IndexName: "UserIdIndex", // Giả định có index cho userId
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
    };

    const result = await dynamoDBClient.send(new QueryCommand(params));
    const friends = await Promise.all(
      result.Items.map(async (item) => {
        let friendName = item.friendName;
        if (!friendName) {
          try {
            const friendData = await cognitoISP
              .adminGetUser({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: item.friendId,
              })
              .promise();
            friendName = friendData.UserAttributes.find((attr) => attr.Name === "name")?.Value || item.friendId;
            await dynamoDBClient.send(
              new UpdateCommand({
                TableName: process.env.DYNAMODB_TABLE_FRIENDS,
                Key: { userId, friendId: item.friendId },
                UpdateExpression: "set friendName = :fn",
                ExpressionAttributeValues: { ":fn": friendName },
              })
            );
          } catch (error) {
            console.error(`Error fetching friend ${item.friendId} name:`, error.message);
            friendName = item.friendId;
          }
        }
        return {
          friendId: item.friendId,
          friendName,
          timestamp: item.timestamp,
        };
      })
    );
    res.status(200).json({ friends });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách bạn bè:", error);
    res.status(400).json({ error: error.message || "Không thể lấy danh sách bạn bè" });
  }
};

export const removeFriend = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { friendId } = req.body;

  if (!accessToken || !friendId) {
    return res.status(400).json({ error: "Yêu cầu access token và friendId" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    if (userId === friendId) {
      return res.status(400).json({ error: "Không thể xóa chính bạn khỏi danh sách bạn bè" });
    }

    // Xác nhận mối quan hệ bạn bè trước khi xóa
    const friendCheck = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_FRIENDS,
        KeyConditionExpression: "userId = :uid AND friendId = :fid",
        ExpressionAttributeValues: {
          ":uid": userId,
          ":fid": friendId,
        },
      })
    );
    if (friendCheck.Items.length === 0) {
      return res.status(400).json({ error: "Không tìm thấy bạn bè để xóa" });
    }

    await Promise.all([
      dynamoDBClient.send(
        new DeleteCommand({
          TableName: process.env.DYNAMODB_TABLE_FRIENDS,
          Key: {
            userId,
            friendId,
          },
        })
      ),
      dynamoDBClient.send(
        new DeleteCommand({
          TableName: process.env.DYNAMODB_TABLE_FRIENDS,
          Key: {
            userId: friendId,
            friendId: userId,
          },
        })
      ),
    ]);

    res.status(200).json({ success: true, message: "Xóa bạn bè thành công", friendSub: friendId });

    global.io.to(friendId).emit("friendRemovedClient", { friendId: userId });
    global.io.to(userId).emit("friendRemovedClient", { friendId });
    global.io.emit("friendListUpdated", { userSub: userId, action: "remove", friendSub: friendId });
    global.io.emit("friendListUpdated", { userSub: friendId, action: "remove", friendSub: userId });
  } catch (error) {
    console.error("Lỗi khi xóa bạn bè:", error);
    res.status(400).json({ error: error.message || "Không thể xóa bạn bè" });
  }
};