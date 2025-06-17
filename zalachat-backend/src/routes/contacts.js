import express from "express";
import {
  sendFriendRequest,
  getFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  removeFriend,
} from "../controllers/contactController.js";
import { authenticateToken } from "../middleware/auth.js"; // Middleware xác thực token Cognito
import { global } from "../config/global.js"; // Giả định global.io được định nghĩa ở đây

const router = express.Router();

// Middleware xác thực token cho tất cả route (trừ trường hợp đặc biệt)
router.use(authenticateToken);

// Route gửi yêu cầu kết bạn
router.post("/send-friend-request", async (req, res) => {
  try {
    const result = await sendFriendRequest(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", { 
        userSub: req.user.sub, 
        action: "send", 
        friendSub: result.friendSub 
      });
      res.status(200).json({ success: true, message: "Yêu cầu kết bạn đã được gửi!" });
    }
  } catch (error) {
    console.error("Error in sendFriendRequest:", error);
    res.status(400).json({ error: error.message });
  }
});

// Route lấy danh sách lời mời kết bạn
router.get("/friend-requests", async (req, res) => {
  try {
    const requests = await getFriendRequests(req, res);
    res.status(200).json(requests);
  } catch (error) {
    console.error("Error in getFriendRequests:", error);
    res.status(400).json({ error: error.message });
  }
});

// Route chấp nhận yêu cầu kết bạn
router.post("/accept-friend-request", async (req, res) => {
  try {
    const result = await acceptFriendRequest(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", { 
        userSub: req.user.sub, 
        action: "accept", 
        friendSub: result.friendSub 
      });
      res.status(200).json({ success: true, message: "Đã chấp nhận lời mời kết bạn!" });
    }
  } catch (error) {
    console.error("Error in acceptFriendRequest:", error);
    res.status(400).json({ error: error.message });
  }
});

// Route từ chối yêu cầu kết bạn
router.post("/reject-friend-request", async (req, res) => {
  try {
    const result = await rejectFriendRequest(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", { 
        userSub: req.user.sub, 
        action: "reject", 
        friendSub: result.friendSub 
      });
      res.status(200).json({ success: true, message: "Đã từ chối lời mời kết bạn!" });
    }
  } catch (error) {
    console.error("Error in rejectFriendRequest:", error);
    res.status(400).json({ error: error.message });
  }
});

// Route lấy danh sách bạn bè
router.get("/friends", async (req, res) => {
  try {
    const friends = await getFriends(req, res);
    res.status(200).json({ friends });
  } catch (error) {
    console.error("Error in getFriends:", error);
    res.status(400).json({ error: error.message });
  }
});

// Route hủy kết bạn
router.post("/remove-friend", async (req, res) => {
  try {
    const result = await removeFriend(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", { 
        userSub: req.user.sub, 
        action: "remove", 
        friendSub: result.friendSub 
      });
      res.status(200).json({ success: true, message: "Đã hủy kết bạn!" });
    }
  } catch (error) {
    console.error("Error in removeFriend:", error);
    res.status(400).json({ error: error.message });
  }
});

export default router;