import express from "express";
import multer from "multer";
import cors from "cors"; // Import cors
import { updateUserInfo, getUserInfo, getUserById, register, confirmOTP, login, forgotPassword, resetPassword, changePassword } from "../controllers/authController.js";

const router = express.Router();

// Define allowed origins
const allowedOrigins = [
  "http://localhost:3000", // Development
  "https://zala-chat-ygt9.vercel.app", // Your Vercel domain
  "https://zalachat-backend.onrender.com" // Render backend domain
];

// Apply CORS middleware to the router
router.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow cookies/auth credentials if needed
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allow preflight requests
  allowedHeaders: ["Content-Type", "Authorization"] // Allow common headers
}));

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