import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  const handleSendCode = async () => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/auth/forgot-password`, { username: email });
      setStep(2);
    } catch (error) {
      alert(error.response?.data?.error || "Gửi mã thất bại");
    }
  };

  const handleResetPassword = async () => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/auth/reset-password`, {
        username: email,
        code,
        newPassword,
      });
      alert("Đặt lại mật khẩu thành công");
      navigate("/login");
    } catch (error) {
      alert(error.response?.data?.error || "Đặt lại mật khẩu thất bại");
    }
  };

  return (
    <div className="blur-container">
      <h1 style={{ fontSize: "28px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" }}>
        Quên mật khẩu
      </h1>
      {step === 1 ? (
        <>
          <p style={{ fontSize: "16px", textAlign: "center", marginBottom: "10px" }}>
            Nhập email để nhận liên kết đặt lại mật khẩu
          </p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <button onClick={handleSendCode} style={styles.button}>
            Gửi mã
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="Mã xác nhận"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Mật khẩu mới"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={styles.input}
          />
          <button onClick={handleResetPassword} style={styles.button}>
            Đặt lại mật khẩu
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  input: {
    width: "100%",
    padding: "15px",
    borderRadius: "12px",
    marginBottom: "20px",
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
};

export default ForgotPassword;