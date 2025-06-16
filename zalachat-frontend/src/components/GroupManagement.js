import React, { useState, useEffect } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import io from "socket.io-client";

function GroupManagement({ group, onClose, currentUser }) {
  const [groupName, setGroupName] = useState(group?.name || "");
  const [selectedMembers, setSelectedMembers] = useState(
    group?.members.map((m) => m.userId) || []
  );
  const [friends, setFriends] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [admins, setAdmins] = useState(
    group?.members?.filter((m) => m.role === "admin").map((m) => m.userId) || []
  );
  const [groupMembers, setGroupMembers] = useState(group?.members || []);
  const socketRef = React.useRef(null);

  // Initialize Socket.IO
  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken) {
      console.error("No accessToken found in localStorage");
      return;
    }

    socketRef.current = io("http://localhost:5000", {
      auth: { token: tokens.accessToken },
    });

    socketRef.current.on("connect", () => {
      console.log("Socket.IO connected successfully");
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Fetch friends list
  const fetchFriends = async () => {
    setIsLoading(true);
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/contacts/friends`,
        {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }
      );
      const friendMap = {};
      if (Array.isArray(response.data)) {
        response.data.forEach((friend) => {
          if (friend.friendId && friend.friendName) {
            friendMap[friend.friendId] = friend.friendName;
          }
        });
        setFriends(response.data);
      } else {
        setFriends([]);
        toast.error("Dữ liệu bạn bè không hợp lệ");
      }
      setUserNames((prev) => ({ ...prev, ...friendMap }));
    } catch (error) {
      console.error("Error fetching friends:", error);
      toast.error("Không thể lấy danh sách bạn bè");
      setFriends([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Get friend name for userId
  const getFriendName = (userId) => {
    return userNames[userId] || userId;
  };

  // Fetch friends list on component mount
  useEffect(() => {
    fetchFriends();
  }, []);

  // Handle member selection for creating group
  const handleToggleMember = (friendId) => {
    setSelectedMembers((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  // Add member to group (admin only)
  const handleAddMember = async (friendId) => {
    if (!group || !currentUser) return;
    if (!isAdmin) {
      toast.error("Bạn không có quyền thêm thành viên");
      return;
    }
    if (selectedMembers.includes(friendId)) {
      toast.info(`${getFriendName(friendId)} đã ở trong nhóm`);
      return;
    }
    setIsLoading(true);
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      await axios.post(
        `${process.env.REACT_APP_API_URL}/groups/${group.groupId}/add-member`,
        { memberId: friendId },
        {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }
      );
      setSelectedMembers((prev) => [...prev, friendId]);
      setGroupMembers((prev) => [...prev, { userId: friendId, role: "member" }]);
      socketRef.current.emit("groupUpdated", {
        groupId: group.groupId,
        newMember: friendId,
      });
      toast.success(`${getFriendName(friendId)} đã được thêm vào nhóm`);
    } catch (error) {
      console.error("Error adding member:", error);
      toast.error(error.response?.data?.error || "Không thể thêm thành viên");
    } finally {
      setIsLoading(false);
    }
  };

  // Remove member from group (admin only)
  const handleRemoveMember = async (userId) => {
    if (!group || !currentUser) return;
    if (!isAdmin) {
      toast.error("Bạn không có quyền xóa thành viên");
      return;
    }
    if (userId === currentUser) {
      toast.error("Bạn không thể xóa chính mình");
      return;
    }
    if (window.confirm(`Xóa ${getFriendName(userId)} khỏi nhóm?`)) {
      setIsLoading(true);
      try {
        const tokens = JSON.parse(localStorage.getItem("tokens"));
        await axios.post(
          `${process.env.REACT_APP_API_URL}/groups/${group.groupId}/remove-member`,
          { memberId: userId },
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          }
        );
        setSelectedMembers((prev) => prev.filter((id) => id !== userId));
        setAdmins((prev) => prev.filter((id) => id !== userId));
        setGroupMembers((prev) => prev.filter((m) => m.userId !== userId));
        socketRef.current.emit("groupUpdated", {
          groupId: group.groupId,
          removedMember: userId,
        });
        toast.success(`${getFriendName(userId)} đã bị xóa khỏi nhóm`);
      } catch (error) {
        console.error("Error removing member:", error);
        toast.error(error.response?.data?.error || "Không thể xóa thành viên");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Leave group (available to all members)
  const handleLeaveGroup = async () => {
    if (!group || !currentUser) return;
    if (window.confirm(`Bạn có chắc chắn muốn rời nhóm ${groupName}?`)) {
      setIsLoading(true);
      try {
        const tokens = JSON.parse(localStorage.getItem("tokens"));
        if (!tokens?.accessToken) {
          throw new Error("Không tìm thấy token xác thực");
        }
        await axios.post(
          `${process.env.REACT_APP_API_URL}/groups/${group.groupId}/remove-member`,
          { memberId: currentUser },
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          }
        );
        socketRef.current.emit("groupUpdated", {
          groupId: group.groupId,
          removedMember: currentUser,
        });
        toast.success(`Bạn đã rời nhóm ${groupName}`);
        onClose();
      } catch (error) {
        console.error("Error leaving group:", error);
        let errorMessage = "Không thể rời nhóm";
        if (error.response) {
          if (error.response.status === 401) {
            errorMessage = "Phiên đăng nhập hết hạn, vui lòng đăng nhập lại";
          } else if (error.response.status === 403) {
            errorMessage = "Bạn không có quyền rời nhóm";
          } else if (error.response.status === 404) {
            errorMessage = "Nhóm không tồn tại";
          } else if (error.response.data?.error) {
            errorMessage = error.response.data.error;
          }
        } else if (error.message.includes("Network Error")) {
          errorMessage = "Lỗi mạng, vui lòng kiểm tra kết nối";
        }
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Assign admin role (admin only, loses own admin role)
  const handleAssignAdmin = async (userId) => {
    if (!group || !currentUser) return;
    if (!isAdmin) {
      toast.error("Bạn không có quyền gán admin");
      return;
    }
    if (userId === currentUser) {
      toast.error("Bạn không thể tự gán quyền admin cho chính mình");
      return;
    }
    if (window.confirm(`Gán quyền admin cho ${getFriendName(userId)}? Bạn sẽ mất quyền admin.`)) {
      setIsLoading(true);
      try {
        const tokens = JSON.parse(localStorage.getItem("tokens"));
        await axios.post(
          `${process.env.REACT_APP_API_URL}/groups/${group.groupId}/assign-role`,
          { memberId: userId, role: "admin" },
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          }
        );
        await axios.post(
          `${process.env.REACT_APP_API_URL}/groups/${group.groupId}/assign-role`,
          { memberId: currentUser, role: "member" },
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          }
        );
        setAdmins([userId]);
        setGroupMembers((prev) =>
          prev.map((m) =>
            m.userId === userId
              ? { ...m, role: "admin" }
              : m.userId === currentUser
              ? { ...m, role: "member" }
              : m
          )
        );
        socketRef.current.emit("groupUpdated", {
          groupId: group.groupId,
          updatedMember: userId,
          role: "admin",
        });
        socketRef.current.emit("groupUpdated", {
          groupId: group.groupId,
          updatedMember: currentUser,
          role: "member",
        });
        toast.success(`${getFriendName(userId)} giờ là admin`);
      } catch (error) {
        console.error("Error assigning admin:", error);
        toast.error(error.response?.data?.error || "Không thể gán quyền admin");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Dissolve group (admin only)
  const handleDissolveGroup = async () => {
    if (!group || !currentUser) return;
    if (!isAdmin) {
      toast.error("Bạn không có quyền giải tán nhóm");
      return;
    }
    if (window.confirm(`Bạn có chắc chắn muốn giải tán nhóm ${groupName}?`)) {
      setIsLoading(true);
      try {
        const tokens = JSON.parse(localStorage.getItem("tokens"));
        await axios.post(
          `${process.env.REACT_APP_API_URL}/groups/${group.groupId}/dissolve`,
          {},
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          }
        );
        socketRef.current.emit("groupDissolved", { groupId: group.groupId });
        toast.success(`Nhóm ${groupName} đã bị giải tán`);
        onClose();
      } catch (error) {
        console.error("Error dissolving group:", error);
        toast.error(error.response?.data?.error || "Không thể giải tán nhóm");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Create new group
  const handleSaveGroup = async () => {
    if (!groupName.trim()) {
      toast.error("Vui lòng nhập tên nhóm");
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error("Vui lòng chọn ít nhất một thành viên");
      return;
    }

    setIsLoading(true);
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      const payload = {
        name: groupName,
        memberIds: selectedMembers,
      };
      await axios.post(
        `${process.env.REACT_APP_API_URL}/groups`,
        payload,
        {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }
      );
      toast.success(`Nhóm ${groupName} đã được tạo!`);
      window.dispatchEvent(new Event("groupCreated"));
      onClose();
    } catch (error) {
      console.error("Error creating group:", error);
      toast.error(error.response?.data?.error || "Không thể tạo nhóm");
    } finally {
      setIsLoading(false);
    }
  };

  // Check if current user is admin
  const isAdmin = groupMembers.find((m) => m.userId === currentUser)?.role === "admin";

  // Render member item for group members
  const renderMemberItem = (friend) => {
    const isMember = selectedMembers.includes(friend.friendId);
    const friendName = getFriendName(friend.friendId);

    if (group) {
      if (isMember) {
        return (
          <div key={friend.friendId} style={styles.memberItem}>
            <div style={styles.memberAvatar}>
              {friendName.charAt(0).toUpperCase()}
            </div>
            <span style={styles.memberName}>
              {friendName}
              {admins.includes(friend.friendId) && (
                <span style={styles.adminBadge}> (Admin)</span>
              )}
            </span>
            {friend.friendId !== currentUser && isAdmin && (
              <>
                <button
                  onClick={() => handleRemoveMember(friend.friendId)}
                  style={styles.removeButton}
                  disabled={isLoading}
                >
                  Xóa
                </button>
                <button
                  onClick={() => handleAssignAdmin(friend.friendId)}
                  style={styles.adminButton}
                  disabled={isLoading || admins.includes(friend.friendId)}
                >
                  Gán Admin
                </button>
              </>
            )}
          </div>
        );
      }
      return null;
    }

    // For creating new group
    return (
      <div key={friend.friendId} style={styles.memberItem}>
        <input
          type="checkbox"
          checked={isMember}
          onChange={() => handleToggleMember(friend.friendId)}
          disabled={isLoading}
          style={styles.checkbox}
        />
        <div style={styles.memberAvatar}>
          {friendName.charAt(0).toUpperCase()}
        </div>
        <span style={styles.memberName}>{friendName}</span>
      </div>
    );
  };

  // Render friend item for adding new members
  const renderAddableFriendItem = (friend) => {
    if (!group || selectedMembers.includes(friend.friendId)) {
      return null;
    }
    const friendName = getFriendName(friend.friendId);
    return (
      <div key={friend.friendId} style={styles.memberItem}>
        <div style={styles.memberAvatar}>
          {friendName.charAt(0).toUpperCase()}
        </div>
        <span style={styles.memberName}>{friendName}</span>
        {isAdmin && (
          <button
            onClick={() => handleAddMember(friend.friendId)}
            style={styles.addButton}
            disabled={isLoading}
          >
            Thêm
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={styles.modal}>
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <div style={styles.modalContent}>
        <h2 style={styles.title}>{group ? "Quản lý nhóm" : "Tạo nhóm mới"}</h2>
        <div style={styles.formGroup}>
          <label style={styles.label}>Tên nhóm:</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nhập tên nhóm"
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Thành viên:</label>
          {isLoading ? (
            <p style={styles.emptyText}>Đang tải...</p>
          ) : group && groupMembers.length === 0 ? (
            <p style={styles.emptyText}>Không có thành viên nào</p>
          ) : (
            <div style={styles.memberList}>
              {friends
                .filter((friend) =>
                  group ? selectedMembers.includes(friend.friendId) : true
                )
                .map(renderMemberItem)
                .filter(Boolean)}
            </div>
          )}
        </div>
        {group && isAdmin && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Thêm thành viên mới:</label>
            {isLoading ? (
              <p style={styles.emptyText}>Đang tải...</p>
            ) : friends.length === 0 ? (
              <p style={styles.emptyText}>Không có bạn bè để thêm</p>
            ) : (
              <div style={styles.memberList}>
                {friends.map(renderAddableFriendItem).filter(Boolean)}
              </div>
            )}
          </div>
        )}
        <div style={styles.buttonGroup}>
          {group ? (
            <>
              <button
                onClick={handleLeaveGroup}
                style={styles.leaveButton}
                disabled={isLoading}
              >
                Rời Nhóm
              </button>
              {isAdmin && (
                <button
                  onClick={handleDissolveGroup}
                  style={styles.dissolveButton}
                  disabled={isLoading}
                >
                  Giải tán Nhóm
                </button>
              )}
              <button
                onClick={onClose}
                style={styles.cancelButton}
                disabled={isLoading}
              >
                Hủy
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSaveGroup}
                style={styles.saveButton}
                disabled={isLoading}
              >
                {isLoading ? "Đang tạo..." : "Tạo Nhóm"}
              </button>
              <button
                onClick={onClose}
                style={styles.cancelButton}
                disabled={isLoading}
              >
                Hủy
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    fontFamily: "'Roboto', sans-serif",
  },
  modalContent: {
    background: "linear-gradient(135deg, #ffffff, #f0f4f8)",
    padding: "24px",
    borderRadius: "16px",
    width: "450px",
    maxHeight: "85vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
    transition: "transform 0.3s ease-in-out",
    transform: "scale(1)",
  },
  title: {
    fontSize: "24px",
    fontWeight: "600",
    marginBottom: "20px",
    color: "#1a3c61",
    textAlign: "center",
  },
  formGroup: {
    marginBottom: "24px",
  },
  label: {
    fontSize: "16px",
    fontWeight: "500",
    marginBottom: "8px",
    display: "block",
    color: "#1a3c61",
  },
  input: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #d1d9e6",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s",
    backgroundColor: "#fff",
  },
  memberList: {
    maxHeight: "250px",
    overflowY: "auto",
    border: "1px solid #e0e7ff",
    borderRadius: "10px",
    padding: "12px",
    backgroundColor: "#fff",
  },
  memberItem: {
    display: "flex",
    alignItems: "center",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "8px",
    backgroundColor: "#f9fafb",
    transition: "background-color 0.2s",
  },
  checkbox: {
    marginRight: "12px",
    transform: "scale(1.2)",
  },
  memberAvatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "#0078FF",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    marginRight: "12px",
    flexShrink: 0,
  },
  memberName: {
    flex: 1,
    fontSize: "15px",
    color: "#1a3c61",
  },
  adminBadge: {
    fontSize: "13px",
    color: "#0078FF",
    fontWeight: "500",
  },
  removeButton: {
    padding: "6px 12px",
    backgroundColor: "#ff4d4f",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    marginLeft: "8px",
    transition: "background-color 0.2s, transform 0.1s",
  },
  addButton: {
    padding: "6px 12px",
    backgroundColor: "#28a745",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    marginLeft: "8px",
    transition: "background-color 0.2s, transform 0.1s",
  },
  adminButton: {
    padding: "6px 12px",
    backgroundColor: "#0078FF",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    marginLeft: "8px",
    transition: "background-color 0.2s, transform 0.1s",
  },
  leaveButton: {
    padding: "10px 20px",
    backgroundColor: "#f39c12",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s, transform 0.1s",
  },
  dissolveButton: {
    padding: "10px 20px",
    backgroundColor: "#dc3545",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s, transform 0.1s",
  },
  buttonGroup: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
    marginTop: "20px",
  },
  saveButton: {
    padding: "10px 20px",
    backgroundColor: "#0078FF",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s, transform 0.1s",
  },
  cancelButton: {
    padding: "10px 20px",
    backgroundColor: "#6c757d",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s, transform 0.1s",
  },
  emptyText: {
    fontSize: "15px",
    color: "#6c757d",
    textAlign: "center",
    margin: "20px 0",
  },
};

// Add hover styles via CSS
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
  .member-item:hover {
    background-color: #e0e7ff;
  }
  .remove-button:hover {
    background-color: #e63946;
    transform: scale(1.05);
  }
  .add-button:hover {
    background-color: #218838;
    transform: scale(1.05);
  }
  .admin-button:hover {
    background-color: #005bc4;
    transform: scale(1.05);
  }
  .leave-button:hover {
    background-color: #e08e0b;
    transform: scale(1.05);
  }
  .dissolve-button:hover {
    background-color: #c82333;
    transform: scale(1.05);
  }
  .save-button:hover {
    background-color: #005bc4;
    transform: scale(1.05);
  }
  .cancel-button:hover {
    background-color: #5a6268;
    transform: scale(1.05);
  }
  .input:focus {
    border-color: #0078FF;
    box-shadow: 0 0 0 2px rgba(0, 120, 255, 0.2);
  }
`;
document.head.appendChild(styleSheet);

export default GroupManagement;