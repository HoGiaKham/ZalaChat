import React, { useState, useEffect } from "react";
import { FaBell, FaPalette, FaLock, FaQuestionCircle, FaInfoCircle } from "react-icons/fa";
import Switch from "react-switch";
import axios from "axios";
import { useTheme } from "../contexts/ThemeContext";

const settingsOptions = [
  { id: "1", icon: <FaBell />, label: "Thông báo" },
  { id: "2", icon: <FaPalette />, label: "Chủ đề giao diện" },
  { id: "3", icon: <FaLock />, label: "Bảo mật" },
  { id: "4", icon: <FaQuestionCircle />, label: "Trợ giúp" },
  { id: "5", icon: <FaInfoCircle />, label: "Thông tin ứng dụng" },
];

function Settings() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isAppInfoModalOpen, setIsAppInfoModalOpen] = useState(false);
  const [isNotificationOn, setIsNotificationOn] = useState(() => {
    const savedState = localStorage.getItem("isNotificationOn");
    return savedState === "true";
  });
  const [notificationTime, setNotificationTime] = useState(localStorage.getItem("notificationTime") || "15 phút");

  // State cho việc đổi mật khẩu
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const savedNotificationTime = localStorage.getItem("notificationTime");
    if (savedNotificationTime) {
      setNotificationTime(savedNotificationTime);
    }
  }, []);

  // Effect cho chế độ tối
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      document.body.style.height = "100%";
      document.body.style.margin = "0";
    } else {
      document.body.classList.remove("dark-mode");
      document.body.style.height = "auto";
      document.body.style.margin = "0";
    }
  }, [isDarkMode]);

  const handleOptionClick = (label) => {
    switch (label) {
      case "Thông báo":
        setIsModalOpen(true);
        break;
      case "Chủ đề giao diện":
        setIsThemeModalOpen(true);
        break;
      case "Bảo mật":
        setIsSecurityModalOpen(true);
        break;
      case "Trợ giúp":
        window.open("https://support.example.com", "_blank");
        break;
      case "Thông tin ứng dụng":
        setIsAppInfoModalOpen(true);
        break;
      default:
        alert("Chưa chọn tùy chọn nào");
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const closeThemeModal = () => {
    setIsThemeModalOpen(false);
  };

  const closeSecurityModal = () => {
    setIsSecurityModalOpen(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setError("");
  };

  const closeAppInfoModal = () => {
    setIsAppInfoModalOpen(false);
  };

  const saveSettings = () => {
    localStorage.setItem("isNotificationOn", isNotificationOn);
    localStorage.setItem("notificationTime", notificationTime);
    setIsModalOpen(false);
  };

  const toggleNotification = (checked) => {
    setIsNotificationOn(checked);
  };

  const handleNotificationTimeChange = (time) => {
    setNotificationTime(time);
  };

  const handlePasswordChange = async () => {
    // Kiểm tra các trường trống
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setError("Vui lòng điền đầy đủ thông tin.");
      return;
    }

    // Kiểm tra mật khẩu mới và xác nhận mật khẩu có khớp không
    if (newPassword !== confirmNewPassword) {
      setError("Mật khẩu mới và xác nhận mật khẩu không khớp.");
      return;
    }

    // Kiểm tra mật khẩu mới có giống mật khẩu cũ không
    if (newPassword === oldPassword) {
      setError("Mật khẩu mới không thể giống mật khẩu cũ.");
      return;
    }

    try {
      // Lấy token từ localStorage
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      if (!tokens || !tokens.accessToken) {
        setError("Bạn cần đăng nhập lại để thay đổi mật khẩu.");
        return;
      }

      // Gửi yêu cầu API để thay đổi mật khẩu
      await axios.post(
        `${process.env.REACT_APP_API_URL}/auth/change-password`,
        {
          oldPassword,
          newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }
      );

      // Nếu thành công
      alert("Mật khẩu đã được thay đổi thành công.");
      closeSecurityModal();
    } catch (error) {
      // Xử lý lỗi từ server
      const errorMessage = error.response?.data?.error || "Đã xảy ra lỗi. Vui lòng thử lại.";
      setError(errorMessage);
    }
  };

  return (
    <div className="tab-container" style={isDarkMode ? darkModeStyles : lightModeStyles}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" }}>
        Cài đặt
      </h1>
      <div>
        {settingsOptions.map((item) => (
          <div key={item.id} style={styles.option} onClick={() => handleOptionClick(item.label)}>
            <span style={styles.icon}>{item.icon}</span>
            <p style={styles.label}>{item.label}</p>
          </div>
        ))}
      </div>

      {/* Notification Modal */}
      {isModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2 style={modalStyles.title}>Tắt thông báo</h2>
            <div style={modalStyles.content}>
              <p style={modalStyles.description}>Tắt thông báo về đoạn chat này?</p>
              <div style={modalStyles.options}>
                {["15 phút", "1 giờ", "4 giờ", "1 ngày", "Cho đến khi tôi bật lại"].map((time, index) => (
                  <div
                    key={index}
                    style={{
                      ...modalStyles.option,
                      backgroundColor: notificationTime === time ? "#1E90FF" : "transparent",
                      color: notificationTime === time ? "#fff" : "#000",
                    }}
                    onClick={() => handleNotificationTimeChange(time)}
                  >
                    <span>{time}</span>
                    {notificationTime === time && <span style={modalStyles.checkmark}>✔</span>}
                  </div>
                ))}
              </div>
              <div style={modalStyles.switchContainer}>
                <Switch
                  onChange={toggleNotification}
                  checked={isNotificationOn}
                  offColor="#ccc"
                  onColor="#4CAF50"
                  uncheckedIcon={false}
                  checkedIcon={false}
                  height={20}
                  width={48}
                />
                <span>{isNotificationOn ? "Bật" : "Tắt"}</span>
              </div>
              <div style={modalStyles.Container}>
                <button style={modalStyles.button} onClick={closeModal}>Đóng</button>
                <button style={{ ...modalStyles.button, backgroundColor: "#4CAF50" }} onClick={saveSettings}>Lưu</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme Modal */}
      {isThemeModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2 style={modalStyles.title}>Chọn chủ đề giao diện</h2>
            <div style={modalStyles.switchContainer}>
              <Switch
                onChange={toggleTheme}
                checked={isDarkMode}
                offColor="#ccc"
                onColor="#4CAF50"
                uncheckedIcon={false}
                checkedIcon={false}
                height={20}
                width={48}
              />
              <span>{isDarkMode ? "Chế độ tối" : "Chế độ sáng"}</span>
            </div>
            <div style={modalStyles.buttonContainer}>
              <button style={modalStyles.button} onClick={closeThemeModal}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Security Modal */}
      {isSecurityModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2 style={modalStyles.title}>Cài đặt bảo mật</h2>
            <p style={modalStyles.description}>Đổi mật khẩu của bạn.</p>
            <div style={modalStyles.options}>
              <div style={modalStyles.option}>
                <input
                  type="password"
                  placeholder="Mật khẩu cũ"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  style={modalStyles.input}
                />
              </div>
              <div style={modalStyles.option}>
                <input
                  type="password"
                  placeholder="Mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={modalStyles.input}
                />
              </div>
              <div style={modalStyles.option}>
                <input
                  type="password"
                  placeholder="Xác nhận mật khẩu mới"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  style={modalStyles.input}
                />
              </div>
              {error && <p style={modalStyles.error}>{error}</p>}
            </div>
            <div style={modalStyles.buttonContainer}>
              <button style={modalStyles.button} onClick={closeSecurityModal}>Đóng</button>
              <button style={{ ...modalStyles.button, backgroundColor: "#4CAF50" }} onClick={handlePasswordChange}>Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}

      {/* App Info Modal */}
      {isAppInfoModalOpen && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2 style={modalStyles.title}>Thông tin ứng dụng</h2>
            <div style={modalStyles.content}>
              <p style={modalStyles.description}>
                <strong>Tên ứng dụng:</strong> ZalaChat
              </p>
              <p style={modalStyles.description}>
                <strong>Phiên bản:</strong> 1.1.1.1
              </p>
              <p style={modalStyles.description}>
                <strong>Nhà phát triển:</strong> Nhóm 7
              </p>
              <p style={modalStyles.description}>
              <strong>Liên hệ:</strong> <a href="mailto:support@chatapp.com">support@chatapp.com</a>
              </p>
              <p style={modalStyles.description}>
                <strong>Mô tả:</strong> Ứng dụng trò chuyện tiện lợi, an toàn và dễ sử dụng.
              </p>
            </div>
            <div style={modalStyles.buttonContainer}>
              <button style={modalStyles.button} onClick={closeAppInfoModal}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  option: {
    display: "flex",
    alignItems: "center",
    background: "rgba(255, 255, 255, 0.9)",
    padding: "14px",
    borderRadius: "12px",
    marginBottom: "12px",
    cursor: "pointer",
    transition: "background-color 0.3s ease",
  },
  icon: {
    marginRight: "12px",
    fontSize: "22px",
    color: "#1E90FF",
  },
  label: {
    fontSize: "16px",
    color: "#000",
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "12px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    fontSize: "14px",
  },
  error: {
    color: "red",
    fontSize: "14px",
    marginTop: "10px",
  },
};

const darkModeStyles = {
  backgroundColor: "#333",
  color: "#fff",
  minHeight: "100vh",
};

const lightModeStyles = {
  backgroundColor: "#fff",
  color: "#000",
  minHeight: "100vh",
};

const modalStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    width: "350px",
    textAlign: "center",
    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
  },
  title: {
    fontSize: "20px",
    marginBottom: "20px",
    fontWeight: "bold",
  },
  description: {
    fontSize: "16px",
    marginBottom: "20px",
    textAlign: "left",
  lineHeight: "1.5", 
  },
  options: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "20px",
  },
  option: {
    marginBottom: "10px",
  },
  buttonContainer: {
    display: "flex",
    justifyContent: "space-between",
  },
  button: {
    padding: "10px 20px",
    fontSize: "16px",
    backgroundColor: "#1E90FF",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "background-color 0.3s",
  },
  checkmark: {
    fontSize: "20px",
    color: "#fff",
  },
  switchContainer: {
    marginBottom: "20px",
  },
};

export default Settings;