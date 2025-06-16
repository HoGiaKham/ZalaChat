import { CognitoUserPool, CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";
import AWS from "aws-sdk";
import { cognitoConfig } from "../config/aws.js";

const userPool = new CognitoUserPool(cognitoConfig);
const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: process.env.AWS_REGION,
});
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
});

export const updateUserInfo = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { name, phone_number, email } = req.body;

  if (!accessToken) {
    return res.status(401).json({ error: "Access token is required" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    let username = userData.Username;
    const subAttr = userData.UserAttributes.find(attr => attr.Name === "sub");
    if (subAttr) username = subAttr.Value;

    const userAttributes = [];
    if (name) userAttributes.push({ Name: "name", Value: name });
    if (phone_number) userAttributes.push({ Name: "phone_number", Value: phone_number });
    if (email) userAttributes.push({ Name: "email", Value: email });

    if (req.file) {
      if (req.file.size > 2 * 1024 * 1024) {
        return res.status(400).json({ error: "Ảnh quá lớn, vui lòng chọn ảnh dưới 2MB" });
      }
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Định dạng không hỗ trợ. Vui lòng chọn file JPG, JPEG, PNG hoặc GIF." });
      }

      const fileName = `avatars/${username}_${Date.now()}_${req.file.originalname}`;
      const s3Params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: "public-read",
      };

      const s3Result = await s3.upload(s3Params).promise();
      userAttributes.push({ Name: "custom:picture", Value: s3Result.Location });
    }

    const params = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: username,
      UserAttributes: userAttributes,
    };

    console.log("→ Gửi tới Cognito:", params);
    await cognitoISP.adminUpdateUserAttributes(params).promise();

    const updatedUser = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const updatedAttributes = {};
    updatedUser.UserAttributes.forEach((attr) => {
      updatedAttributes[attr.Name] = attr.Value;
    });

    console.log("→ Dữ liệu sau cập nhật:", updatedAttributes);

    res.json({
      message: "Cập nhật thông tin thành công",
      attributes: updatedAttributes,
    });
  } catch (error) {
    console.error("❌ Lỗi cập nhật:", error);
    res.status(400).json({ error: error.message || "Không thể cập nhật thông tin" });
  }
};

export const getUserInfo = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    return res.status(401).json({ error: "Access token is required" });
  }

  try {
    const params = { AccessToken: accessToken };
    const userData = await cognitoISP.getUser(params).promise();

    const userAttributes = {};
    userData.UserAttributes.forEach((attr) => {
      userAttributes[attr.Name] = attr.Value;
    });

    res.json({
      username: userData.Username,
      attributes: userAttributes,
    });
  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(400).json({ error: error.message || "Failed to fetch user info" });
  }
};

export const getUserById = async (req, res) => {
  const { userId } = req.params;
  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken || !userId) {
    return res.status(401).json({ error: "Access token and userId are required" });
  }

  try {
    await cognitoISP.getUser({ AccessToken: accessToken }).promise();

    const userData = await cognitoISP
      .adminGetUser({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: userId,
      })
      .promise();

    const attributes = {};
    userData.UserAttributes.forEach((attr) => {
      attributes[attr.Name] = attr.Value;
    });

    res.json({
      username: userId,
      name: attributes.name || userId,
      email: attributes.email || "Chưa cung cấp",
      phone: attributes.phone_number || "Chưa cung cấp",
    });
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(400).json({ error: error.message || "Failed to fetch user info" });
  }
};

export const register = async (req, res) => {
  const { email, password, name, phoneNumber } = req.body;
  if (!email || !password || !name || !phoneNumber) {
    return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" });
  }

  const attributes = [
    { Name: "email", Value: email },
    { Name: "name", Value: name },
    { Name: "phone_number", Value: phoneNumber },
  ];

  userPool.signUp(email, password, attributes, null, (err, result) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ username: email });
  });
};

export const confirmOTP = async (req, res) => {
  const { username, otpCode } = req.body;
  const userData = { Username: username, Pool: userPool };
  const cognitoUser = new CognitoUser(userData);

  cognitoUser.confirmRegistration(otpCode, true, (err, result) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: "Xác minh thành công" });
  });
};

export const login = async (req, res) => {
  const { username, password } = req.body;
  const authenticationDetails = new AuthenticationDetails({
    Username: username,
    Password: password,
  });

  const userData = { Username: username, Pool: userPool };
  const cognitoUser = new CognitoUser(userData);

  cognitoUser.authenticateUser(authenticationDetails, {
    onSuccess: (result) => {
      res.json({
        idToken: result.getIdToken().getJwtToken(),
        accessToken: result.getAccessToken().getJwtToken(),
        refreshToken: result.getRefreshToken().getToken(),
      });
    },
    onFailure: (err) => res.status(400).json({ error: err.message }),
  });
};

export const forgotPassword = async (req, res) => {
  const { username } = req.body;
  const userData = { Username: username, Pool: userPool };
  const cognitoUser = new CognitoUser(userData);

  cognitoUser.forgotPassword({
    onSuccess: () => res.json({ message: "Mã đặt lại đã được gửi" }),
    onFailure: (err) => res.status(400).json({ error: err.message }),
  });
};

export const resetPassword = async (req, res) => {
  const { username, code, newPassword } = req.body;
  const userData = { Username: username, Pool: userPool };
  const cognitoUser = new CognitoUser(userData);

  cognitoUser.confirmPassword(code, newPassword, {
    onSuccess: () => res.json({ message: "Đặt lại mật khẩu thành công" }),
    onFailure: (err) => res.status(400).json({ error: err.message }),
  });
};

export const changePassword = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  const { oldPassword, newPassword } = req.body;

  if (!accessToken || !oldPassword || !newPassword) {
    return res.status(400).json({ error: "Access token, old password, and new password are required" });
  }

  try {
    const userData = await cognitoISP.getUser({ AccessToken: accessToken }).promise();
    const username = userData.Username;

    const userDataCognito = { Username: username, Pool: userPool };
    const cognitoUser = new CognitoUser(userDataCognito);

    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: oldPassword,
    });

    await new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => resolve(result),
        onFailure: (err) => reject(err),
      });
    });

    await new Promise((resolve, reject) => {
      cognitoUser.changePassword(oldPassword, newPassword, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    res.json({ message: "Thay đổi mật khẩu thành công" });
  } catch (error) {
    console.error("Error changing password:", error);
    let errorMessage = "Không thể thay đổi mật khẩu";
    if (error.code === "NotAuthorizedException") {
      errorMessage = "Mật khẩu cũ không chính xác";
    } else if (error.code === "InvalidParameterException") {
      errorMessage = "Mật khẩu mới không hợp lệ (kiểm tra yêu cầu độ dài, ký tự)";
    } else if (error.code === "LimitExceededException") {
      errorMessage = "Vượt quá giới hạn yêu cầu, vui lòng thử lại sau";
    }
    res.status(400).json({ error: errorMessage });
  }
};