import React from "react";
import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext"; // Import ThemeProvider từ ThemeContext

// Import các component
import Login from "./components/Login";
import Register from "./components/Register";
import ForgotPassword from "./components/ForgotPassword";
import OTPConfirm from "./components/OTPConfirm";
import MainTabs from "./components/MainTabs";

function App() {
  // Định nghĩa mảng themes
  const themes = [
    { color: "#3b82f6", title: "Màu xanh" },
    { color: "#f472b6", title: "Màu hồng" },
    { color: "#22c55e", title: "Màu xanh lá" },
    { color: "#9333ea", title: "Màu tím" },
  ];

  return (
    <ThemeProvider> {/* Bọc toàn bộ ứng dụng trong ThemeProvider để sử dụng chế độ sáng/tối */}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/otp-confirm" element={<OTPConfirm />} />
        <Route path="/app/*" element={<MainTabs themes={themes} />} /> {/* Truyền themes vào MainTabs */}
        <Route path="/" element={<Login />} /> {/* Route mặc định */}
      </Routes>
    </ThemeProvider>
  );
}

export default App;