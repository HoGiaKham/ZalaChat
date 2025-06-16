import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "../config/aws.js";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";

const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION,
});
export const updateNickname = async (req, res) => {
  console.log("Gọi API PUT /api/groups/:groupId/members/:userId/nickname với groupId:", req.params.groupId, "userId:", req.params.userId);
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { groupId, userId } = req.params;
  const { nickname } = req.body;

  if (!accessToken || !groupId || !userId || !nickname) {
    console.log("Thiếu thông tin đầu vào:", { accessToken, groupId, userId, nickname });
    return res.status(400).json({ error: "Access token, group ID, user ID, and nickname are required" });
  }

  try {
    console.log("Xác thực token với Cognito...");
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const requesterId = userData.Username;
    console.log("Người yêu cầu:", requesterId);

    console.log("Lấy thông tin nhóm từ DynamoDB...");
    const groupData = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        KeyConditionExpression: "groupId = :gid",
        ExpressionAttributeValues: { ":gid": groupId },
      })
    );

    if (!groupData.Items.length) {
      console.log("Nhóm không tồn tại:", groupId);
      return res.status(404).json({ error: "Group not found" });
    }

    const group = groupData.Items[0];
    const member = group.members.find((m) => m.userId === userId);
    const requester = group.members.find((m) => m.userId === requesterId);

    if (!member) {
      console.log("Thành viên không tồn tại trong nhóm:", { userId, groupId });
      return res.status(404).json({ error: "Member not found in group" });
    }

    // Chỉ kiểm tra nếu người đổi là thành viên hợp lệ, không cần admin
    if (!group.members.some((m) => m.userId === requesterId)) {
      console.log("Người yêu cầu không phải thành viên của nhóm:", { requesterId, groupId });
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    const updatedMembers = group.members.map((m) =>
      m.userId === userId ? { ...m, nickname: nickname } : m
    );

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        Key: { groupId },
        UpdateExpression: "SET members = :members",
        ExpressionAttributeValues: { ":members": updatedMembers },
      })
    );

    console.log("Cập nhật biệt hiệu thành công:", { groupId, userId, nickname });

    // Lấy tên từ dữ liệu thành viên
    const changerName = requester?.nickname || requester?.name || requesterId;
    const targetName = member?.nickname || member?.name || userId;
    const notification = `${changerName} đã đổi biệt hiệu của ${targetName} thành ${nickname}`;
    group.members.forEach((member) => {
      global.io.to(member.userId).emit("nicknameChanged", {
        groupId,
        userId,
        newNickname: nickname,
        changerId: requesterId,
        notification,
      });
    });

    res.status(200).json({ message: "Nickname updated successfully" });
  } catch (error) {
    console.error("Lỗi cập nhật biệt hiệu:", error);
    res.status(500).json({ error: "Failed to update nickname" });
  }
};
export const createGroup = async (req, res) => {
  console.log("Gọi API POST /api/groups với body:", JSON.stringify(req.body, null, 2));
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { name, memberIds } = req.body;

  if (!accessToken || !name || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
    console.log("Thiếu thông tin đầu vào:", { accessToken, name, memberIds });
    return res.status(400).json({ error: "Access token, group name, and at least one member ID are required" });
  }

  try {
    console.log("Xác thực token với Cognito...");
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const creatorId = userData.Username;
    console.log("Người tạo nhóm:", creatorId);

    console.log("Kiểm tra danh sách bạn bè...");
    const friendCheck = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_FRIENDS,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": creatorId },
      })
    );
    const validMembers = friendCheck.Items.map((item) => item.friendId);
    console.log("Danh sách bạn bè hợp lệ:", validMembers);

    if (!memberIds.every((id) => validMembers.includes(id))) {
      console.log("Lỗi: Một số memberIds không phải bạn bè:", memberIds);
      return res.status(400).json({ error: "Some members are not in your friend list" });
    }

    const groupId = uuidv4();
    const members = [...new Set([creatorId, ...memberIds])].map((id) => ({
      userId: id,
      role: id === creatorId ? "admin" : "member",
    }));
    console.log("Dữ liệu nhóm sẽ lưu:", { groupId, name, members });

    await dynamoDBClient.send(
      new PutCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        Item: {
          groupId,
          name,
          creatorId,
          members,
          createdAt: new Date().toISOString(),
        },
      })
    );
    console.log("Lưu nhóm thành công:", groupId);

    members.forEach((member) => {
      console.log(`Phát sự kiện groupCreated cho user ${member.userId}`);
      global.io.to(member.userId).emit("groupCreated", { groupId, name, members });
    });

    res.json({ groupId, name, members });
  } catch (error) {
    console.error("Lỗi tạo nhóm:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
};

export const getGroups = async (req, res) => {
  console.log("Gọi API GET /api/groups");
  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    console.log("Thiếu access token");
    return res.status(401).json({ error: "Access token is required" });
  }

  try {
    console.log("Xác thực token với Cognito...");
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;
    console.log("Người dùng:", userId);

    const groupData = await dynamoDBClient.send(
      new ScanCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        ConsistentRead: true,
      })
    );
    console.log("Kết quả quét Groups:", JSON.stringify(groupData.Items, null, 2));

    const filteredGroups = groupData.Items.filter((group) =>
      group.members?.some((member) => member.userId === userId)
    );

    const formattedGroups = filteredGroups.map((group) => ({
      groupId: group.groupId,
      name: group.name,
      creatorId: group.creatorId,
      members: group.members,
      createdAt: group.createdAt,
    }));

    console.log("Nhóm sau khi lọc:", JSON.stringify(formattedGroups, null, 2));
    res.json(formattedGroups);
  } catch (error) {
    console.error("Lỗi lấy danh sách nhóm:", error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
};

export const getGroupMembers = async (req, res) => {
  console.log("Gọi API GET /api/groups/:groupId/members với groupId:", req.params.groupId);
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { groupId } = req.params;

  if (!accessToken) {
    console.log("Thiếu access token");
    return res.status(401).json({ error: "Access token is required" });
  }

  if (!groupId) {
    console.log("Thiếu groupId");
    return res.status(400).json({ error: "Group ID is required" });
  }

  try {
    console.log("Xác thực token với Cognito...");
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;
    console.log("Người dùng:", userId);

    console.log("Lấy thông tin nhóm từ DynamoDB...");
    const groupData = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        KeyConditionExpression: "groupId = :gid",
        ExpressionAttributeValues: { ":gid": groupId },
      })
    );

    if (!groupData.Items.length) {
      console.log("Nhóm không tồn tại:", groupId);
      return res.status(404).json({ error: "Group not found" });
    }

    const group = groupData.Items[0];

    console.log("Kiểm tra quyền truy cập...");
    const isMember = group.members.some((m) => m.userId === userId);
    if (!isMember) {
      console.log("Người dùng không phải thành viên của nhóm:", { userId, groupId });
      return res.status(403).json({ error: "You are not a member of this group" });
    }

console.log("Lấy chi tiết thành viên từ Cognito...");
const membersWithDetails = await Promise.all(
  group.members.map(async (member) => {
    try {
      const userDetails = await cognitoISP
        .adminGetUser({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: member.userId,
        })
        .promise();

      const name = userDetails.UserAttributes.find((attr) => attr.Name === "name")?.Value || member.userId;
      const email = userDetails.UserAttributes.find((attr) => attr.Name === "email")?.Value || "";
      const phone = userDetails.UserAttributes.find((attr) => attr.Name === "phone_number")?.Value || "";

      return {
        userId: member.userId,
        name: name,
        email: email,
        phone: phone,
        role: member.role,
        avatar: "👤", // Customize this if avatar data is available
      };
    } catch (error) {
      console.error(`Lỗi lấy thông tin người dùng ${member.userId}:`, error);
      return {
        userId: member.userId,
        name: member.userId,
        email: "",
        phone: "",
        role: member.role,
        avatar: "👤",
      };
    }
  })
);

    console.log("Danh sách thành viên:", JSON.stringify(membersWithDetails, null, 2));
    res.json(membersWithDetails);
  } catch (error) {
    console.error("Lỗi lấy danh sách thành viên nhóm:", error);
    res.status(500).json({ error: "Failed to fetch group members" });
  }
};

export const addMember = async (req, res) => {
  console.log("Gọi API POST /api/groups/:groupId/add-member với groupId:", req.params.groupId);
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { groupId } = req.params;
  const { memberId } = req.body;

  if (!accessToken || !memberId) {
    return res.status(400).json({ error: "Access token and member ID are required" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const groupData = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        KeyConditionExpression: "groupId = :gid",
        ExpressionAttributeValues: { ":gid": groupId },
      })
    );

    if (!groupData.Items.length) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = groupData.Items[0];
    if (!group.members.find((m) => m.userId === userId && m.role === "admin")) {
      return res.status(403).json({ error: "Only admins can add members" });
    }

    if (group.members.find((m) => m.userId === memberId)) {
      return res.status(400).json({ error: "User is already a member" });
    }

    const updatedMembers = [...group.members, { userId: memberId, role: "member" }];

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        Key: { groupId },
        UpdateExpression: "SET members = :members",
        ExpressionAttributeValues: { ":members": updatedMembers },
      })
    );

    res.json({ message: "Member added" });

    global.io.to(memberId).emit("groupUpdated", { groupId, newMember: memberId, members: updatedMembers });
    group.members.forEach((member) => {
      global.io.to(member.userId).emit("groupUpdated", { groupId, newMember: memberId });
    });
  } catch (error) {
    console.error("Lỗi thêm thành viên:", error);
    res.status(500).json({ error: "Failed to add member" });
  }
};

export const removeMember = async (req, res) => {
  console.log("Gọi API POST /api/groups/:groupId/remove-member với groupId:", req.params.groupId);
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { groupId } = req.params;
  const { memberId } = req.body;

  if (!accessToken || !memberId) {
    return res.status(400).json({ error: "Access token and member ID are required" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const groupData = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        KeyConditionExpression: "groupId = :gid",
        ExpressionAttributeValues: { ":gid": groupId },
      })
    );

    if (!groupData.Items.length) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = groupData.Items[0];

    const isMember = group.members.some((m) => m.userId === userId);
    if (!isMember) {
      return res.status(403).json({ error: "Bạn không phải thành viên của nhóm này" });
    }

    const isAdmin = group.members.find((m) => m.userId === userId && m.role === "admin");
    if (memberId !== userId && !isAdmin) {
      return res.status(403).json({ error: "Chỉ admin mới có thể xóa thành viên khác" });
    }

    const updatedMembers = group.members.filter((m) => m.userId !== memberId);
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        Key: { groupId },
        UpdateExpression: "SET members = :members",
        ExpressionAttributeValues: { ":members": updatedMembers },
      })
    );

    res.json({ message: "Thành viên đã được xóa" });

    global.io.to(memberId).emit("groupUpdated", { groupId, removedMember: memberId });
    updatedMembers.forEach((member) => {
      global.io.to(member.userId).emit("groupUpdated", { groupId, removedMember: memberId });
    });
  } catch (error) {
    console.error("Lỗi xóa thành viên:", error);
    res.status(500).json({ error: "Không thể xóa thành viên" });
  }
};

export const dissolveGroup = async (req, res) => {
  console.log("Gọi API POST /api/groups/:groupId/dissolve với groupId:", req.params.groupId);
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { groupId } = req.params;

  if (!accessToken) {
    return res.status(400).json({ error: "Access token is required" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const groupData = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        KeyConditionExpression: "groupId = :gid",
        ExpressionAttributeValues: { ":gid": groupId },
      })
    );

    if (!groupData.Items.length) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = groupData.Items[0];
    if (group.creatorId !== userId) {
      return res.status(403).json({ error: "Only the creator can dissolve the group" });
    }

    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        Key: { groupId },
      })
    );

    res.json({ message: "Group dissolved" });

    group.members.forEach((member) => {
      global.io.to(member.userId).emit("groupDissolved", { groupId });
    });
  } catch (error) {
    console.error("Lỗi giải tán nhóm:", error);
    res.status(500).json({ error: "Failed to dissolve group" });
  }
};

export const assignRole = async (req, res) => {
  console.log("Gọi API POST /api/groups/:groupId/assign-role với groupId:", req.params.groupId);
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { groupId } = req.params;
  const { memberId, role } = req.body;

  if (!accessToken || !memberId || !["admin", "member"].includes(role)) {
    return res.status(400).json({ error: "Access token, member ID, and valid role are required" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const userId = userData.Username;

    const groupData = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        KeyConditionExpression: "groupId = :gid",
        ExpressionAttributeValues: { ":gid": groupId },
      })
    );

    if (!groupData.Items.length) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = groupData.Items[0];
    if (!group.members.find((m) => m.userId === userId && m.role === "admin")) {
      return res.status(403).json({ error: "Only admins can assign roles" });
    }

    const updatedMembers = group.members.map((m) =>
      m.userId === memberId ? { ...m, role } : m
    );

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: process.env.DYNAMODB_TABLE_GROUPS,
        Key: { groupId },
        UpdateExpression: "SET members = :members",
        ExpressionAttributeValues: { ":members": updatedMembers },
      })
    );

    res.json({ message: `Role updated to ${role}` });

    group.members.forEach((member) => {
      global.io.to(member.userId).emit("groupUpdated", { groupId, updatedMember: memberId, role });
    });
  } catch (error) {
    console.error("Lỗi phân quyền:", error);
    res.status(500).json({ error: "Failed to assign role" });
  }
};

export const getGroupMessages = async (req, res) => {
  console.log("Gọi API GET /api/groups/:groupId/messages với groupId:", req.params.groupId);
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { groupId } = req.params;

  if (!accessToken) {
    return res.status(401).json({ error: "Access token is required" });
  }

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_GROUP_MESSAGES,
      KeyConditionExpression: "groupId = :gid",
      ExpressionAttributeValues: { ":gid": groupId },
    };

    const result = await dynamoDBClient.send(new QueryCommand(params));
    res.json(result.Items || []);
  } catch (error) {
    console.error("Lỗi lấy tin nhắn nhóm:", error);
    res.status(500).json({ error: "Failed to fetch group messages" });
  }
};