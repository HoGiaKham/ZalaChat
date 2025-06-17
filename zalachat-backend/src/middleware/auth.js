// src/middleware/auth.js
import jwt from "jsonwebtoken";

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("Token verification error:", err.message);
      return res.status(403).json({ error: "Invalid token" });
    }
    // Lưu thông tin user (sub từ Cognito) vào request
    req.user = { sub: decoded.sub, username: decoded["cognito:username"] || decoded.sub };
    next();
  });
};