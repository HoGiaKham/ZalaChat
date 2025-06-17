import express from "express";
import multer from "multer";
import { updateUserInfo, getUserInfo, getUserById, register, confirmOTP, login, forgotPassword, resetPassword, changePassword } from "../controllers/authController.js";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Định dạng file không hợp lệ"), false);
    }
  },
});

router.post("/update-user", upload.single("picture"), updateUserInfo);
router.get("/user", getUserInfo);
router.get("/user/:userId", getUserById);
router.post("/register", register);
router.post("/confirm-otp", confirmOTP);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", changePassword);

export default router;