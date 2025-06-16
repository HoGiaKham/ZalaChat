import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

function OTPConfirm() {
  const [otpCode, setOtpCode] = useState("");
  const [timeLeft, setTimeLeft] = useState(60); // 1 minute countdown
  const [isExpired, setIsExpired] = useState(false);
  const [isResending, setIsResending] = useState(false); // Track resend state
  const navigate = useNavigate();
  const location = useLocation();
  const username = location.state?.username;

  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleConfirm = async () => {
    if (isExpired) {
      alert("Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.");
      return;
    }

    if (!username) {
      alert("Lỗi: Không tìm thấy thông tin người dùng. Vui lòng thử lại từ bước đăng ký.");
      navigate("/register");
      return;
    }

    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/auth/confirm-otp`, {
        username,
        otpCode,
      });
      alert("Xác minh thành công");
      navigate("/login");
    } catch (error) {
      alert(error.response?.data?.error || "Xác minh thất bại. Vui lòng kiểm tra mã OTP.");
    }
  };

  const handleResendOTP = async () => {
    if (isResending) {
      alert("Vui lòng đợi trước khi gửi lại mã OTP.");
      return;
    }

    if (!username) {
      alert("Lỗi: Không tìm thấy thông tin người dùng. Vui lòng thử lại từ bước đăng ký.");
      navigate("/register");
      return;
    }

    setIsResending(true);
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/auth/resend-otp`, {
        username,
      });
      setOtpCode(""); // Clear input field
      setTimeLeft(60); // Reset timer
      setIsExpired(false); // Reset expiry state
      alert("Mã OTP mới đã được gửi.");
    } catch (error) {
      alert(error.response?.data?.error || "Gửi lại mã OTP thất bại. Vui lòng thử lại sau.");
    } finally {
      setTimeout(() => setIsResending(false), 5000); // 5-second cooldown for resend
    }
  };

  return (
    <div className="blur-container">
      <h1 style={{ fontSize: "28px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" }}>
        Nhập mã OTP
      </h1>
      <p style={styles.timer}>
        Thời gian còn lại: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
      </p>
      <input
        type="text"
        placeholder="Mã xác minh"
        value={otpCode}
        onChange={(e) => setOtpCode(e.target.value)}
        style={styles.input}
        disabled={isExpired}
      />
      <button onClick={handleConfirm} style={styles.button} disabled={isExpired}>
        {isExpired ? "Mã OTP hết hạn" : "Xác nhận"}
      </button>
      <p style={styles.resend}>
        Không nhận được?{" "}
        <span
          onClick={handleResendOTP}
          style={{
            color: isResending ? "#aaa" : "#1E90FF",
            cursor: isResending ? "not-allowed" : "pointer",
            textDecoration: "underline",
          }}
        >
          Gửi lại mã OTP
        </span>
      </p>
    </div>
  );
}

const styles = {
  input: {
    width: "100%",
    padding: "15px",
    borderRadius: "12px",
    marginBottom: "15px",
    fontSize: "16px",
    border: "none",
    background: "rgba(255, 255, 255, 0.9)",
  },
  button: {
    width: "100%",
    padding: "15px",
    borderRadius: "12px",
    background: "#1E90FF",
    color: "#fff",
    fontSize: "18px",
    fontWeight: "bold",
    border: "none",
    cursor: "pointer",
  },
  timer: {
    fontSize: "16px",
    color: "#555",
    textAlign: "center",
    marginBottom: "15px",
  },
  resend: {
    fontSize: "14px",
    color: "#555",
    textAlign: "center",
    marginTop: "10px",
  },
};

export default OTPConfirm;