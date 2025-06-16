import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "./config/aws.js";
import AWS from "aws-sdk";

const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION,
});

const updateFriendsTable = async () => {
  const params = {
    TableName: process.env.DYNAMODB_TABLE_FRIENDS,
  };
  try {
    const result = await dynamoDBClient.send(new ScanCommand(params));

    for (const item of result.Items) {
      const { userId, friendId } = item;
      try {
        const friendData = await cognitoISP
          .adminGetUser({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: friendId,
          })
          .promise();
        const friendName = friendData.UserAttributes.find(attr => attr.Name === "name")?.Value || friendId;

        await dynamoDBClient.send(
          new UpdateCommand({
            TableName: process.env.DYNAMODB_TABLE_FRIENDS,
            Key: { userId, friendId },
            UpdateExpression: "set friendName = :name",
            ExpressionAttributeValues: { ":name": friendName },
          })
        );
        console.log(`Updated friendName for userId: ${userId}, friendId: ${friendId}`);
      } catch (error) {
        console.error(`Error updating friendId: ${friendId}`, error);
      }
    }
    console.log("Finished updating Friends table");
  } catch (error) {
    console.error("Error scanning Friends table:", error);
  }
};

const updateFriendRequestsTable = async () => {
  const params = {
    TableName: process.env.DYNAMODB_TABLE_FRIEND_REQUESTS,
    FilterExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": "pending" },
  };
  try {
    const result = await dynamoDBClient.send(new ScanCommand(params));

    for (const item of result.Items) {
      const { receiverId, requestId, senderId } = item;
      try {
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
            UpdateExpression: "set senderName = :name",
            ExpressionAttributeValues: { ":name": senderName },
          })
        );
        console.log(`Updated senderName for requestId: ${requestId}`);
      } catch (error) {
        console.error(`Error updating senderId: ${senderId}`, error);
      }
    }
    console.log("Finished updating FriendRequests table");
  } catch (error) {
    console.error("Error scanning FriendRequests table:", error);
  }
};

const main = async () => {
  await updateFriendsTable();
  await updateFriendRequestsTable();
};

main().catch(console.error);