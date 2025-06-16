import React, { useState, useEffect } from "react";
import axios from "axios";
import { useTheme } from "../contexts/ThemeContext";

function Profile() {
  const [user, setUser] = useState({
    name: "",
    phone: "",
    email: "",
    avatar: "https://i.pravatar.cc/150?img=8",
  });
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    avatar: "",
    avatarFile: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { isDarkMode } = useTheme();

  const fetchUserInfo = async () => {
    try {
      setLoading(true);
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      if (!tokens?.accessToken) {
        throw new Error("No access token found");
      }

      const response = await axios.get(`${process.env.REACT_APP_API_URL}/auth/user`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      const { attributes } = response.data;
      console.log("Dữ liệu từ server:", attributes);
      const userData = {
        name: attributes.name || "Chưa đặt tên",
        phone: attributes.phone_number || "Chưa có số điện thoại",
        email: attributes.email || "Chưa có email",
        avatar: attributes["custom:picture"] || "https://i.pravatar.cc/150?img=8",
      };
      console.log("userData đã xử lý:", userData);
      setUser(userData);
      setFormData({
        name: userData.name,
        phone: userData.phone,
        email: userData.email,
        avatar: userData.avatar,
        avatarFile: null,
      });
    } catch (err) {
      console.error("Lỗi khi lấy thông tin người dùng:", err);
      setError(err.message || "Không thể tải thông tin người dùng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserInfo();
  }, []);

  const handleEditToggle = () => {
    setEditMode(!editMode);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Ảnh quá lớn, vui lòng chọn ảnh dưới 2MB");
        return;
      }
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
      if (!allowedTypes.includes(file.type)) {
        alert("Định dạng không hỗ trợ. Vui lòng chọn file JPG, JPEG, PNG hoặc GIF.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, avatar: reader.result, avatarFile: file });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdate = async () => {
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      if (!tokens?.accessToken) {
        throw new Error("No access token found");
      }

      let formattedPhone = formData.phone;
      if (formattedPhone && formattedPhone.startsWith("0")) {
        formattedPhone = "+84" + formattedPhone.slice(1);
      }

      const phoneRegex = /^\+84\d{9}$/;
      if (formattedPhone && !phoneRegex.test(formattedPhone)) {
        throw new Error("Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại đúng định dạng.");
      }

      const formDataToSend = new FormData();
      formDataToSend.append("name", formData.name || "");
      formDataToSend.append("phone_number", formattedPhone || "");
      formDataToSend.append("email", formData.email || "");
      if (formData.avatarFile) {
        formDataToSend.append("picture", formData.avatarFile);
      }

      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/auth/update-user`,
        formDataToSend,
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      console.log("Phản hồi từ update API:", response.data);

      if (response.data.attributes) {
        const updatedUserData = {
          name: response.data.attributes.name || "Chưa đặt tên",
          phone: response.data.attributes.phone_number || "Chưa có số điện thoại",
          email: response.data.attributes.email || "Chưa có email",
          avatar: response.data.attributes["custom:picture"] || user.avatar,
        };
        setUser(updatedUserData);
        setFormData({
          name: updatedUserData.name,
          phone: updatedUserData.phone,
          email: updatedUserData.email,
          avatar: updatedUserData.avatar,
          avatarFile: null,
        });
      }

      await fetchUserInfo();

      setEditMode(false);
      alert("Cập nhật thông tin thành công");
    } catch (err) {
      console.error("Lỗi khi cập nhật:", err.response?.data || err);
      setError(err.response?.data?.error || err.message || "Không thể cập nhật thông tin. Vui lòng thử lại.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("tokens");
    window.location.href = "/login";
  };

  if (loading) {
    return <div className="tab-container">Đang tải...</div>;
  }

  if (error) {
    return <div className="tab-container">Lỗi: {error}</div>;
  }

  const styles = {
    container: {
      backgroundColor: isDarkMode ? "#121212" : "#fff",
      color: isDarkMode ? "#fff" : "#000",
      padding: "20px",
      height: "100vh",
      width: "100%",
    },
    card: {
      background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.85)",
      borderRadius: "16px",
      padding: "24px",
      textAlign: "center",
    },
    avatar: {
      width: "100px",
      height: "100px",
      borderRadius: "50px",
      marginBottom: "16px",
    },
    name: {
      fontSize: "20px",
      fontWeight: "bold",
      color: isDarkMode ? "#fff" : "#000",
    },
    phone: {
      fontSize: "16px",
      color: isDarkMode ? "#ccc" : "#444",
      marginBottom: "10px",
    },
    email: {
      fontSize: "16px",
      color: isDarkMode ? "#ccc" : "#444",
      marginBottom: "20px",
    },
    input: {
      width: "100%",
      padding: "12px",
      borderRadius: "10px",
      marginBottom: "10px",
      fontSize: "16px",
      border: "none",
      background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.9)",
      color: isDarkMode ? "#fff" : "#000",
    },
    button: {
      width: "100%",
      padding: "12px",
      borderRadius: "10px",
      background: "#1E90FF",
      color: "#fff",
      fontWeight: "bold",
      border: "none",
      cursor: "pointer",
      marginTop: "10px",
    },
    cancelButton: {
      width: "100%",
      padding: "12px",
      borderRadius: "10px",
      background: "#ccc",
      color: "#000",
      fontWeight: "bold",
      border: "none",
      cursor: "pointer",
      marginTop: "10px",
    },
    logoutButton: {
      width: "100%",
      padding: "12px",
      borderRadius: "10px",
      background: "#FF4C4C",
      color: "#fff",
      fontWeight: "bold",
      border: "none",
      cursor: "pointer",
      marginTop: "10px",
    },
  };

  return (
    <div className="tab-container" style={styles.container}>
      <div style={styles.card}>
        <img src={formData.avatar || user.avatar} alt={user.name} style={styles.avatar} />
        {editMode ? (
          <>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.gif"
              onChange={handleAvatarChange}
              style={{ marginBottom: "10px" }}
            />
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Họ tên"
              style={styles.input}
            />
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="Số điện thoại"
              style={styles.input}
            />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Email"
              style={styles.input}
            />
            <button onClick={handleUpdate} style={styles.button}>
              Lưu
            </button>
            <button onClick={handleEditToggle} style={styles.cancelButton}>
              Hủy
            </button>
          </>
        ) : (
          <>
            <p style={styles.name}>{user.name}</p>
            <p style={styles.phone}>{user.phone}</p>
            <p style={styles.email}>{user.email}</p>
            <button onClick={handleEditToggle} style={styles.button}>
              Chỉnh sửa thông tin
            </button>
            <button onClick={handleLogout} style={styles.logoutButton}>
              Đăng xuất
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default Profile;