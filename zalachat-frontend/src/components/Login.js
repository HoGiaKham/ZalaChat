import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const navigate = useNavigate();

  const verifyEmailReal = async (emailToCheck) => {
    if (!emailToCheck) return;

    setIsCheckingEmail(true);
    setEmailError("");

    try {
      const response = await axios.get("https://emailverification.whoisxmlapi.com/api/v3", {
        params: {
          apiKey: "at_bGM8cQH9GFkX7kzSjycoquCFMvrUL",
          emailAddress: emailToCheck,
        },
      });

      const data = response.data;
      if (!data.smtpCheck || data.smtpCheck !== "true") {
        setEmailError("Email không tồn tại hoặc không hợp lệ.");
      }
    } catch (error) {
      console.error("Lỗi kiểm tra email:", error);
      setEmailError("Không thể kiểm tra email lúc này.");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleLogin = async () => {
    if (emailError || isCheckingEmail) return;

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/auth/login`, {
        username: email,
        password,
      });
      localStorage.setItem("tokens", JSON.stringify(response.data));
      navigate("/app/chats");
    } catch (error) {
      alert(error.response?.data?.error || "Đăng nhập thất bại");
    }
  };

  return (
    <div className="blur-container">
      <h1 style={{ fontSize: "36px", fontWeight: "bold", textAlign: "center", marginBottom: "40px" }}>
        ZalaChat
      </h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError("");
        }}
        onBlur={() => verifyEmailReal(email)}
        style={styles.input}
      />
      {emailError && <p style={styles.error}>{emailError}</p>}
      {isCheckingEmail && <p style={styles.info}>Đang kiểm tra email...</p>}

      <input
        type="password"
        placeholder="Mật khẩu"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
      />

      <button onClick={handleLogin} style={styles.button} disabled={isCheckingEmail}>
        {isCheckingEmail ? "Vui lòng đợi..." : "Đăng nhập"}
      </button>

      <a href="/forgot-password" style={styles.link}>Quên mật khẩu?</a>
      <a href="/register" style={styles.link}>Bạn chưa có tài khoản? Đăng ký</a>
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
  link: {
    color: "#1E90FF",
    marginTop: "15px",
    fontSize: "14px",
    textAlign: "center",
    display: "block",
  },
  error: {
    color: "red",
    marginTop: "-10px",
    marginBottom: "10px",
    fontSize: "14px",
  },
  info: {
    color: "#555",
    fontSize: "14px",
    marginTop: "-10px",
    marginBottom: "10px",
  },
};

export default Login;
