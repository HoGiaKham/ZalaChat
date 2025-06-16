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
        const senderName = userData.UserAttributes.find(attr => attr.Name === "name")?.Value || senderId;

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
        const receiverName = receiverData.UserAttributes.find(attr => attr.Name === "name")?.Value || receiverId;

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

        const requestId = `${senderId}_${receiverId}`;
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
        res.json({ message: "Gửi lời mời kết bạn thành công" });

        global.io.to(receiverId).emit("receiveFriendRequest"); // Phát sự kiện cho người nhận
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
            KeyConditionExpression: "receiverId = :rid",
            FilterExpression: "#status = :status",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":rid": receiverId,
                ":status": "pending",
            },
        };

        const result = await dynamoDBClient.send(new QueryCommand(params));
        res.json(
            result.Items.map((item) => ({
                requestId: item.requestId,
                senderId: item.senderId,
                senderName: item.senderName,
                timestamp: item.timestamp,
            }))
        );
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
        const receiverName = userData.UserAttributes.find(attr => attr.Name === "name")?.Value || receiverId;
        const senderId = requestId.split("_")[0];

        const senderData = await cognitoISP
            .adminGetUser({
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: senderId,
            })
            .promise();
        const senderName = senderData.UserAttributes.find(attr => attr.Name === "name")?.Value || senderId;

        await dynamoDBClient.send(
            new UpdateCommand({
                TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
                Key: { receiverId, requestId },
                UpdateExpression: "set #status = :status",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: { ":status": "accepted" },
            })
        );

        const timestamp = new Date().toISOString();
        const newFriendReceiver = {
            friendId: senderId,
            friendName: senderName,
            timestamp,
        };
        const newFriendSender = {
            friendId: receiverId,
            friendName: receiverName,
            timestamp,
        };

        await Promise.all([
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

        res.json({ message: "Chấp nhận lời mời kết bạn thành công" });

        global.io.to(senderId).emit("friendRequestAcceptedClient", newFriendReceiver); // Phát cho người gửi
        global.io.to(receiverId).emit("friendAdded", newFriendSender); // Phát cho người nhận
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
        const senderId = requestId.split("_")[0];

        await dynamoDBClient.send(
            new UpdateCommand({
                TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
                Key: { receiverId, requestId },
                UpdateExpression: "set #status = :status",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: { ":status": "rejected" },
            })
        );

        res.json({ message: "Từ chối lời mời kết bạn thành công" });

        global.io.to(senderId).emit("friendRequestRejectedClient", receiverId); // Phát cho người gửi
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
            KeyConditionExpression: "userId = :uid",
            ExpressionAttributeValues: {
                ":uid": userId,
            },
        };

        const result = await dynamoDBClient.send(new QueryCommand(params));
        res.json(
            result.Items.map((item) => ({
                friendId: item.friendId,
                friendName: item.friendName,
                timestamp: item.timestamp,
            }))
        );
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
        // Xác thực người dùng
        const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
        const userId = userData.Username;

        if (userId === friendId) {
            return res.status(400).json({ error: "Không thể xóa chính bạn khỏi danh sách bạn bè" });
        }

        // Xóa cả hai chiều của mối quan hệ bạn bè
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

        res.json({ message: "Xóa bạn bè thành công" });

        // Tùy chọn: Thông báo cho người bạn qua Socket.IO
        global.io.to(friendId).emit("friendRemovedClient", { friendId: userId });
        global.io.to(userId).emit("friendRemovedClient", { friendId });
    } catch (error) {
        console.error("Lỗi khi xóa bạn bè:", error);
        res.status(400).json({ error: error.message || "Không thể xóa bạn bè" });
    }
};