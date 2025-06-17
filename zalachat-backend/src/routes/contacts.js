// src/routes/contacts.js
import express from "express";
import {
  sendFriendRequest,
  getFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  removeFriend,
} from "../controllers/contactController.js";
import { authenticateToken } from "../middleware/auth.js";
import { global } from "../config/global.js";

const router = express.Router();

router.use(authenticateToken); // Áp dụng middleware cho tất cả route

router.post("/send-friend-request", async (req, res) => {
  try {
    const result = await sendFriendRequest(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", {
        userSub: req.user.sub,
        action: "send",
        friendSub: result.friendSub,
      });
      res.status(200).json({ success: true, message: "Yêu cầu kết bạn đã được gửi!" });
    }
  } catch (error) {
    console.error("Error in sendFriendRequest:", error);
    res.status(400).json({ error: error.message || "Không thể gửi yêu cầu kết bạn" });
  }
});

router.get("/friend-requests", async (req, res) => {
  try {
    const result = await getFriendRequests(req, res);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getFriendRequests:", error);
    res.status(400).json({ error: error.message || "Không thể lấy danh sách yêu cầu" });
  }
});

router.post("/accept-friend-request", async (req, res) => {
  try {
    const result = await acceptFriendRequest(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", {
        userSub: req.user.sub,
        action: "accept",
        friendSub: result.friendSub,
      });
      res.status(200).json({ success: true, message: "Chấp nhận yêu cầu thành công" });
    }
  } catch (error) {
    console.error("Error in acceptFriendRequest:", error);
    res.status(400).json({ error: error.message || "Không thể chấp nhận yêu cầu" });
  }
});

router.post("/reject-friend-request", async (req, res) => {
  try {
    const result = await rejectFriendRequest(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", {
        userSub: req.user.sub,
        action: "reject",
        friendSub: req.body.friendSub || req.user.sub, // Cần điều chỉnh theo logic backend
      });
      res.status(200).json({ success: true, message: "Từ chối yêu cầu thành công" });
    }
  } catch (error) {
    console.error("Error in rejectFriendRequest:", error);
    res.status(400).json({ error: error.message || "Không thể từ chối yêu cầu" });
  }
});

router.get("/friends", async (req, res) => {
  try {
    const result = await getFriends(req, res);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getFriends:", error);
    res.status(400).json({ error: error.message || "Không thể lấy danh sách bạn bè" });
  }
});

router.post("/remove-friend", async (req, res) => {
  try {
    const result = await removeFriend(req, res);
    if (result.success) {
      global.io.emit("friendListUpdated", {
        userSub: req.user.sub,
        action: "remove",
        friendSub: result.friendSub,
      });
      res.status(200).json({ success: true, message: "Hủy kết bạn thành công" });
    }
  } catch (error) {
    console.error("Error in removeFriend:", error);
    res.status(400).json({ error: error.message || "Không thể hủy kết bạn" });
  }
});

export default router;