import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { AiFillEye, AiFillEyeInvisible } from "react-icons/ai";  // Thêm icon mắt từ react-icons

function Register() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);  // Thêm state để kiểm soát hiển thị mật khẩu
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const navigate = useNavigate();

  const formatPhoneNumber = (phone) => {
    if (phone.startsWith("0")) {
      return "+84" + phone.slice(1);
    }
    return phone;
  };

  const validatePhoneNumber = (phone) => {
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setPhoneError("Số điện thoại không hợp lệ (bắt đầu bằng 0 và đủ 10 số).");
    } else {
      setPhoneError("");
    }
  };

  const verifyEmailReal = async (email) => {
    if (!email) return;

    setIsCheckingEmail(true);
    setEmailError("");

    try {
      const response = await axios.get("https://emailverification.whoisxmlapi.com/api/v3", {
        params: {
          apiKey: "at_bGM8cQH9GFkX7kzSjycoquCFMvrUL",
          emailAddress: email,
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

  const handleRegister = async () => {
    if (phoneError || emailError || isCheckingEmail) return;

    const formattedPhone = formatPhoneNumber(phoneNumber);

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/auth/register`, {
        email,
        password,
        name,
        phoneNumber: formattedPhone,
      });

      navigate("/otp-confirm", { state: { username: response.data.username } });
    } catch (error) {
      const errMsg = error.response?.data?.error?.toLowerCase();
      if (errMsg?.includes("phone") || errMsg?.includes("số điện thoại")) {
        setPhoneError("Số điện thoại đã được sử dụng hoặc không hợp lệ.");
      } else {
        alert(error.response?.data?.error || "Đăng ký thất bại");
      }
    }
  };

  const goToLogin = () => {
    navigate("/login");  // Chuyển đến trang đăng nhập
  };

  return (
    <div className="blur-container">
      <h1 style={styles.title}>Đăng ký</h1>

      <input
        type="text"
        placeholder="Họ tên"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={styles.input}
      />

      <input
        type="text"
        placeholder="Số điện thoại (VD: 0123456789)"
        value={phoneNumber}
        onChange={(e) => {
          setPhoneNumber(e.target.value);
          setPhoneError("");
        }}
        onBlur={() => validatePhoneNumber(phoneNumber)}
        style={styles.input}
      />
      {phoneError && <p style={styles.error}>{phoneError}</p>}

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

      <div style={styles.passwordContainer}>
        <input
          type={showPassword ? "text" : "password"}  // Nếu showPassword = true, hiển thị mật khẩu, nếu không thì ẩn
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}  // Đổi trạng thái của showPassword khi click
          style={styles.eyeButton}
        >
          {showPassword ? <AiFillEyeInvisible /> : <AiFillEye />}  {/* Nếu showPassword là true, hiển thị icon "ẩn mắt", ngược lại hiển thị icon "mắt" */}
        </button>
      </div>

      <button onClick={handleRegister} style={styles.button} disabled={isCheckingEmail}>
        {isCheckingEmail ? "Vui lòng đợi..." : "Đăng ký"}
      </button>

      <button onClick={goToLogin} style={styles.button}>Đã có tài khoản? Đăng nhập</button> {/* Nút đăng nhập */}
    </div>
  );
}

const styles = {
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: "20px",
  },
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
    marginTop: "10px",
  },
  eyeButton: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
  },
  passwordContainer: {
    position: "relative",
    width: "100%",
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

export default Register;
