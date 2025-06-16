import express from "express";
import {
  sendFriendRequest,
  getFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  removeFriend, // Thêm hàm mới
} from "../controllers/contactController.js";

const router = express.Router();

router.post("/send-friend-request", sendFriendRequest);
router.get("/friend-requests", getFriendRequests);
router.post("/accept-friend-request", acceptFriendRequest);
router.post("/reject-friend-request", rejectFriendRequest);
router.get("/friends", getFriends);
router.post("/remove-friend", removeFriend); // Thêm route mới

export default router;