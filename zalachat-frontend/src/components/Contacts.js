import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import io from "socket.io-client";

function Contacts() {
  const [emailInput, setEmailInput] = useState("");
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken) {
      window.location.href = "/login";
      return;
    }

    const fetchFriends = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/contacts/friends`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        setFriends(response.data);
      } catch (error) {
        console.error("Lỗi khi lấy danh sách bạn bè:", error);
        alert(error.response?.data?.error || "Không thể lấy danh sách bạn bè");
      } finally {
        setLoading(false);
      }
    };

    const fetchFriendRequests = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/contacts/friend-requests`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        setFriendRequests(response.data);
      } catch (error) {
        console.error("Lỗi khi lấy lời mời kết bạn:", error);
        alert(error.response?.data?.error || "Không thể lấy lời mời kết bạn");
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
    fetchFriendRequests();

    socketRef.current = io("http://localhost:5000", {
      auth: { token: tokens.accessToken },
    });

    socketRef.current.on("receiveFriendRequest", () => {
      console.log("Nhận được lời mời kết bạn mới!");
      fetchFriendRequests(); 
    });

    socketRef.current.on("friendRequestAcceptedClient", (friendInfo) => {
      console.log("Yêu cầu kết bạn của bạn đã được chấp nhận!", friendInfo);
      fetchFriends(); 
    });

    socketRef.current.on("friendRequestRejectedClient", (receiverId) => {
      console.log(`Yêu cầu kết bạn đến ${receiverId} đã bị từ chối.`);
    });

    socketRef.current.on("friendRemovedClient", ({ friendId }) => {
      console.log(`Bạn đã bị hủy kết bạn với ID: ${friendId}`);
      setFriends(prev => prev.filter(friend => friend.friendId !== friendId));
    });

    // Xử lý sự kiện có bạn bè mới (thông báo cho người được chấp nhận)
    socketRef.current.on("friendAdded", (newFriend) => {
      console.log("Có bạn bè mới:", newFriend);
      setFriends(prev => [...prev, newFriend]);
      setFriendRequests(prev => prev.filter(req => req.senderId !== newFriend.friendId)); // Loại bỏ lời mời đã chấp nhận
    });

    // Cleanup socket khi component unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const validateToken = () => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken) {
      alert("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!");
      window.location.href = "/login";
      return null;
    }
    return tokens;
  };

  const handleAddFriend = async () => {
    const tokens = validateToken();
    if (!tokens || !emailInput) {
      alert("Vui lòng nhập email!");
      return;
    }

    try {
      setLoading(true);
      await axios.post(
        `${process.env.REACT_APP_API_URL}/contacts/send-friend-request`,
        { receiverEmail: emailInput },
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
      );
      alert("Yêu cầu kết bạn đã được gửi!");
      setEmailInput("");
    } catch (error) {
      console.error("Lỗi khi thêm bạn:", error.response?.data, error);
      alert(error.response?.data?.error || "Thêm bạn thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptFriendRequest = async (requestId, senderId) => {
    const tokens = validateToken();
    if (!tokens) return;

    try {
      setLoading(true);
      await axios.post(
        `${process.env.REACT_APP_API_URL}/contacts/accept-friend-request`,
        { requestId },
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
      );
      setFriendRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      // Sau khi chấp nhận, server sẽ phát sự kiện "friendAdded" để cập nhật danh sách bạn bè
      alert("Đã chấp nhận lời mời kết bạn!");
    } catch (error) {
      console.error("Lỗi khi chấp nhận lời mời:", error);
      alert(error.response?.data?.error || "Không thể chấp nhận lời mời");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectFriendRequest = async (requestId) => {
    const tokens = validateToken();
    if (!tokens) return;

    try {
      setLoading(true);
      await axios.post(
        `${process.env.REACT_APP_API_URL}/contacts/reject-friend-request`,
        { requestId },
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
      );
      setFriendRequests((prev) => prev.filter((req) => req.requestId !== requestId));
      alert("Đã từ chối lời mời kết bạn!");
    } catch (error) {
      console.error("Lỗi khi từ chối lời mời:", error);
      alert(error.response?.data?.error || "Không thể từ chối lời mời");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFriend = async (friendId) => {
    const tokens = validateToken();
    if (!tokens) return;

    try {
      setLoading(true);
      await axios.post(
        `${process.env.REACT_APP_API_URL}/contacts/remove-friend`,
        { friendId },
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
      );
      setFriends((prev) => prev.filter((friend) => friend.friendId !== friendId));
      alert("Đã hủy kết bạn!");
    } catch (error) {
      console.error("Lỗi khi hủy kết bạn:", error);
      alert(error.response?.data?.error || "Không thể hủy kết bạn");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-container" style={{ padding: "20px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "12px" }}>Danh bạ</h1>
      <div style={{ display: "flex", marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Nhập email để kết bạn"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          style={styles.input}
          disabled={loading}
        />
        <button onClick={handleAddFriend} style={styles.button} disabled={loading}>
          {loading ? "Đang xử lý..." : "Thêm"}
        </button>
      </div>
      <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: "16px 0 8px" }}>
        Lời mời kết bạn
      </h2>
      {loading ? (
        <p style={{ fontSize: "16px", color: "#666" }}>Đang tải...</p>
      ) : friendRequests.length > 0 ? (
        friendRequests.map((req) => (
          <div key={req.requestId} style={styles.requestItem}>
            <p style={{ fontSize: "16px" }}>{req.senderName || req.senderId}</p>
            <div>
              <button
                onClick={() => handleAcceptFriendRequest(req.requestId, req.senderId)}
                style={{ ...styles.button, background: "#1E90FF", marginRight: "8px" }}
                disabled={loading}
              >
                Chấp nhận
              </button>
              <button
                onClick={() => handleRejectFriendRequest(req.requestId)}
                style={{ ...styles.button, background: "#FF4C4C" }}
                disabled={loading}
              >
                Từ chối
              </button>
            </div>
          </div>
        ))
      ) : (
        <p style={{ fontSize: "16px", color: "#666" }}>Không có lời mời kết bạn</p>
      )}
      <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: "16px 0 8px" }}>
        Danh sách bạn bè
      </h2>
      {loading ? (
        <p style={{ fontSize: "16px", color: "#666" }}>Đang tải...</p>
      ) : friends.length > 0 ? (
        friends.map((friend) => (
          <div key={friend.friendId} style={styles.friendItem}>
            <div style={styles.avatarPlaceholder}>
              {(friend.friendName || friend.friendId)[0].toUpperCase()}
            </div>
            <p style={{ fontSize: "16px" }}>{friend.friendName || friend.friendId}</p>
            <button
              onClick={() => handleRemoveFriend(friend.friendId)}
              style={{ ...styles.button, background: "#FF4C4C", marginLeft: "auto" }}
              disabled={loading}
            >
              Hủy kết bạn
            </button>
          </div>
        ))
      ) : (
        <p style={{ fontSize: "16px", color: "#666" }}>Chưa có bạn bè</p>
      )}
    </div>
  );
}

const styles = {
  input: {
    flex: 1,
    padding: "12px",
    borderRadius: "10px",
    fontSize: "16px",
    border: "none",
    background: "rgba(255, 255, 255, 0.9)",
    marginRight: "8px",
  },
  button: {
    padding: "12px 18px",
    borderRadius: "10px",
    background: "#1E90FF",
    color: "#fff",
    fontWeight: "bold",
    border: "none",
    cursor: "pointer",
  },
  requestItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    background: "rgba(255, 255, 255, 0.85)",
    borderRadius: "12px",
    marginBottom: "10px",
  },
  friendItem: {
    display: "flex",
    alignItems: "center",
    padding: "12px",
    background: "rgba(255, 255, 255, 0.85)",
    borderRadius: "12px",
    marginBottom: "10px",
  },
  avatarPlaceholder: {
    width: "48px",
    height: "48px",
    borderRadius: "24px",
    background: "#1E90FF",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "24px",
    fontWeight: "bold",
    marginRight: "12px",
  },
};

export default Contacts;