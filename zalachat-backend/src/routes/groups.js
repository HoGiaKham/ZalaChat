import express from "express";
import { createGroup, getGroups, addMember, removeMember, dissolveGroup, assignRole, getGroupMembers, getGroupMessages, updateNickname } from "../controllers/groupController.js";

const router = express.Router();

router.post("/", createGroup);
router.get("/", getGroups);
router.get("/:groupId/members", getGroupMembers);
router.post("/:groupId/add-member", addMember);
router.post("/:groupId/remove-member", removeMember);
router.post("/:groupId/dissolve", dissolveGroup);
router.post("/:groupId/assign-role", assignRole);
router.get("/:groupId/messages", getGroupMessages);
router.put("/:groupId/members/:userId/nickname", updateNickname);

export default router;