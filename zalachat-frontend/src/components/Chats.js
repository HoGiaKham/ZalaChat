import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import io from "socket.io-client";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Chats.css";
import ChatWindow from "./ChatWindow";

function Chats({ themes }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [lastMessages, setLastMessages] = useState({});
  const [unreadMessages, setUnreadMessages] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const socketRef = useRef(null);
  const ringtoneRef = useRef(null);

  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken) {
      window.location.href = "/login";
      return;
    }

    const fetchUserInfo = async () => {
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/auth/user`,
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
            timeout: 10000, // Thêm timeout để tránh treo
          }
        );
        setCurrentUser(response.data.username);
      } catch (error) {
        console.error("Error fetching user info:", error);
        toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!");
        localStorage.removeItem("tokens");
        window.location.href = "/login";
      }
    };

    fetchUserInfo();
  }, []);

  const fetchFriends = async () => {
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/contacts/friends`, // Sửa path cho đúng với route backend
        {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
          timeout: 10000,
        }
      );
      return response.data.friends || []; // Đảm bảo trả về mảng friends
    } catch (error) {
      console.error("Error fetching friends:", error);
      return [];
    }
  };

  const getFriendName = async (userId) => {
    const friendMap = await fetchFriends().then((friends) =>
      friends.reduce((map, friend) => {
        map[friend.friendId] = friend.friendName;
        return map;
      }, {})
    );
    return friendMap[userId] || (await (async () => {
      try {
        const tokens = JSON.parse(localStorage.getItem("tokens"));
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/auth/user/${userId}`,
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
            timeout: 10000,
          }
        );
        return response.data.username;
      } catch (error) {
        console.error("Error fetching friend name:", error);
        return userId;
      }
    })());
  };

  const fetchConversations = async () => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken) return Promise.reject("No access token");

    try {
      const friends = await fetchFriends();

      const [convRes] = await Promise.all([
        axios.get(`${process.env.REACT_APP_API_URL}/api/chats/conversations`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
          timeout: 10000,
        }),
      ]);

      const conversations = convRes.data || [];

      const allConversations = await Promise.all(
        friends.map(async (friend) => {
          const existingConv = conversations.find(
            (conv) => conv.friendId === friend.friendId
          );

          const conversationId = existingConv
            ? existingConv.conversationId
            : `new-${friend.friendId}`;

          const friendName =
            localStorage.getItem(`nickname_${conversationId}`) || friend.friendName || (await getFriendName(friend.friendId));
          const theme =
            localStorage.getItem(`theme_${conversationId}`) || existingConv?.theme || "#3b82f6";

          return {
            ...existingConv,
            conversationId,
            friendId: friend.friendId,
            friendName,
            theme,
          };
        })
      );

      const savedOrder = JSON.parse(localStorage.getItem("conversationOrder")) || [];
      const orderedConversations = savedOrder.length
        ? savedOrder
            .map((id) => allConversations.find((conv) => conv.conversationId === id))
            .filter((conv) => conv !== undefined)
        : allConversations;

      try {
        const lastMsgResponse = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/chats/last-messages`,
          {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
            timeout: 10000,
          }
        );
        setLastMessages(lastMsgResponse.data || {});
      } catch (error) {
        console.error("Error fetching last messages:", error);
      }

      localStorage.setItem(
        "conversationOrder",
        JSON.stringify(orderedConversations.map((conv) => conv.conversationId))
      );

      setConversations(orderedConversations);
      return orderedConversations;
    } catch (error) {
      console.error("Error fetching conversations:", error);
      return Promise.reject(error);
    }
  };

  const getMessagePreview = (msg, senderId, currentUser) => {
    if (!msg) return "";
    if (msg.status === "deleted") return "Tin nhắn đã bị xóa";
    if (msg.type === "recalled") return "Tin nhắn đã được thu hồi";
    if (msg.type === "image") return "Hình ảnh";
    if (msg.type === "video") return "Video";
    if (msg.type === "audio") return "Âm thanh";
    if (msg.type === "file") return "Tệp";
    const senderLabel = senderId === currentUser ? "Bạn" : msg.senderName || "Bạn";
    return `${senderLabel}: ${msg.content.slice(0, 50)}`;
  };

  const handleMessageSent = useCallback(
    (conversationId, message) => {
      setLastMessages((prev) => ({
        ...prev,
        [conversationId]: {
          ...message,
          senderId: currentUser,
          timestamp: new Date().toISOString(),
        },
      }));
      setConversations((prevConvs) => {
        const updatedConvs = [...prevConvs];
        const convIndex = updatedConvs.findIndex(
          (conv) => conv.conversationId === conversationId
        );
        if (convIndex !== -1) {
          const [conv] = updatedConvs.splice(convIndex, 1);
          updatedConvs.unshift(conv);
          localStorage.setItem(
            "conversationOrder",
            JSON.stringify(updatedConvs.map((conv) => conv.conversationId))
          );
          return updatedConvs;
        }
        return prevConvs;
      });
    },
    [currentUser]
  );

  useEffect(() => {
    if (socketRef.current && selectedConversation?.conversationId) {
      socketRef.current.emit("joinConversation", {
        conversationId: selectedConversation.conversationId,
      });
      console.log("Joined conversation room (private):", selectedConversation.conversationId);
    }
  }, [selectedConversation?.conversationId]);

  useEffect(() => {
    if (currentUser) {
      fetchConversations().then((convs) => {
        setConversations(convs);
        const savedConversationId = localStorage.getItem("selectedConversationId");
        if (savedConversationId && convs.length > 0) {
          const savedConversation = convs.find(
            (conv) => conv.conversationId === savedConversationId
          );
          setSelectedConversation(savedConversation || convs[0]);
        } else if (convs.length > 0) {
          setSelectedConversation(convs[0]);
        }
      });
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      socketRef.current = io(process.env.REACT_APP_SOCKET_URL, {
        auth: { token: tokens.accessToken },
        transports: ["websocket"], // Chỉ dùng websocket để tránh lỗi polling
        reconnection: true, // Tự động kết nối lại khi mất kết nối
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current.on("connect", () => {
        console.log("Socket.IO connected with ID:", socketRef.current.id);
      });

      socketRef.current.on("connect_error", (error) => {
        console.error("Socket.IO connection error:", error.message);
      });

      socketRef.current.on("receiveMessage", async (message) => {
        if (message.senderId === currentUser) return;
        if (
          selectedConversation &&
          message.conversationId === selectedConversation.conversationId
        ) {
          // Xử lý trong ChatWindow nếu cần
        } else {
          setLastMessages((prev) => ({
            ...prev,
            [message.conversationId]: message,
          }));
          setConversations((prevConvs) => {
            const updatedConvs = [...prevConvs];
            const convIndex = updatedConvs.findIndex(
              (conv) => conv.conversationId === message.conversationId
            );
            if (convIndex !== -1) {
              const [conv] = updatedConvs.splice(convIndex, 1);
              updatedConvs.unshift(conv);
            } else {
              const newConv = {
                conversationId: message.conversationId,
                friendId: message.senderId,
                friendName:getFriendName(message.senderId),
                theme: "#3b82f6",
              };
              updatedConvs.unshift(newConv);
            }
            localStorage.setItem(
              "conversationOrder",
              JSON.stringify(updatedConvs.map((conv) => conv.conversationId))
            );
            return updatedConvs;
          });
          setUnreadMessages((prev) => ({
            ...prev,
            [message.conversationId]: true,
          }));
          toast.info(
            `Tin nhắn mới từ ${await getFriendName(message.senderId)}`,
            {
              position: "top-right",
              autoClose: 3000,
              onClick: () => {
                const conversation = conversations.find(
                  (conv) => conv.conversationId === message.conversationId
                );
                if (conversation) {
                  setSelectedConversation(conversation);
                  setUnreadMessages((prev) => ({
                    ...prev,
                    [message.conversationId]: false,
                  }));
                }
              },
            }
          );
        }
      });

      socketRef.current.on("messageRecalled", (data) => {
        console.log("Received messageRecalled in Chats.js:", data);
        if (
          selectedConversation &&
          data.conversationId === selectedConversation.conversationId
        ) {
          setLastMessages((prev) => ({
            ...prev,
            [data.conversationId]: { ...prev[data.conversationId], type: "recalled" },
          }));
        }
      });

      socketRef.current.on("messageDeleted", (data) => {
        console.log("Received messageDeleted in Chats.js:", data);
        if (
          selectedConversation &&
          data.conversationId === selectedConversation.conversationId
        ) {
          setLastMessages((prev) => ({
            ...prev,
            [data.conversationId]: { ...prev[data.conversationId], status: "deleted" },
          }));
        }
      });

      socketRef.current.on("themeChanged", (data) => {
        setConversations((prevConvs) => {
          const updatedConvs = [...prevConvs];
          const convIndex = updatedConvs.findIndex(
            (conv) => conv.conversationId === data.conversationId
          );
          if (convIndex !== -1) {
            updatedConvs[convIndex] = { ...updatedConvs[convIndex], theme: data.newTheme };
          }
          return updatedConvs;
        });
        if (
          selectedConversation &&
          selectedConversation.conversationId === data.conversationId
        ) {
          setSelectedConversation((prev) => ({
            ...prev,
            theme: data.newTheme,
          }));
        }
        localStorage.setItem(`theme_${data.conversationId}`, data.newTheme);
      });

      socketRef.current.on("nicknameChanged", ({ conversationId, newNickname }) => {
        console.log("Nickname changed event received:", { conversationId, newNickname });
        if (conversationId && newNickname) {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.conversationId === conversationId
                ? { ...conv, friendName: newNickname }
                : conv
            )
          );
          if (
            selectedConversation &&
            selectedConversation.conversationId === conversationId
          ) {
            setSelectedConversation((prev) => ({
              ...prev,
              friendName: newNickname,
            }));
          }
          localStorage.setItem(`nickname_${conversationId}`, newNickname);
        } else {
          console.error("Invalid nicknameChanged data:", { conversationId, newNickname });
        }
      });

      socketRef.current.on("friendListUpdated", async (data) => {
        console.log("Received friend list update:", data);
        const { userSub, action, friendSub } = data;
        if (userSub === currentUser) {
          const updatedFriends = await fetchFriends();
          const updatedConversations = await Promise.all(
            updatedFriends.map(async (friend) => {
              const existingConv = conversations.find(
                (conv) => conv.friendId === friend.friendId
              );
              const conversationId = existingConv
                ? existingConv.conversationId
                : `new-${friend.friendId}`;
              const friendName =
                localStorage.getItem(`nickname_${conversationId}`) || friend.friendName || (await getFriendName(friend.friendId));
              const theme =
                localStorage.getItem(`theme_${conversationId}`) || existingConv?.theme || "#3b82f6";

              return {
                ...existingConv,
                conversationId,
                friendId: friend.friendId,
                friendName,
                theme,
              };
            })
          );

          const savedOrder = JSON.parse(localStorage.getItem("conversationOrder")) || [];
          const orderedConversations = savedOrder.length
            ? savedOrder
                .map((id) => updatedConversations.find((conv) => conv.conversationId === id))
                .filter((conv) => conv !== undefined)
            : updatedConversations;

          setConversations(orderedConversations);
          localStorage.setItem(
            "conversationOrder",
            JSON.stringify(orderedConversations.map((conv) => conv.conversationId))
          );

          // Cập nhật selectedConversation nếu cần
          if (action === "remove" && selectedConversation?.friendId === friendSub) {
            setSelectedConversation(orderedConversations.find((conv) => conv.friendId !== friendSub) || null);
          }
        }
      });

      socketRef.current.on("callRequest", (data) => {
        if (
          data.to === currentUser &&
          data.conversationId === selectedConversation?.conversationId
        ) {
          // Xử lý trong ChatWindow nếu cần
        }
      });

      socketRef.current.on("callResponse", (data) => {
        // Xử lý trong ChatWindow nếu cần
      });

      socketRef.current.on("offer", (data) => {
        // Xử lý trong ChatWindow nếu cần
      });

      socketRef.current.on("answer", (data) => {
        // Xử lý trong ChatWindow nếu cần
      });

      socketRef.current.on("candidate", (data) => {
        // Xử lý trong ChatWindow nếu cần
      });

      return () => {
        if (socketRef.current) socketRef.current.disconnect();
      };
    }
  }, [currentUser, selectedConversation]);

  const handleOpenSettingsModal = () => {
    setIsSettingsModalOpen(true);
  };

  const handleCloseSettingsModal = () => {
    setIsSettingsModalOpen(false);
  };

  return (
    <div className="container">
      <ToastContainer />
      <audio ref={ringtoneRef} preload="auto" />
      <div className="mainContent">
        <div className="sidebar">
          <h2 className="title">Bạn bè</h2>
          {conversations.length > 0 ? (
            conversations.map((conv) => {
              const lastMessage = lastMessages[conv.conversationId];
              const isUnread = unreadMessages[conv.conversationId];
              const isOwnMessage = lastMessage?.senderId === currentUser;
              const senderName = isOwnMessage ? "Bạn" : conv.friendName;
              const messagePreview = getMessagePreview(lastMessage, lastMessage?.senderId, currentUser);
              return (
                <div
                  key={conv.conversationId}
                  className={`conversation ${
                    selectedConversation?.conversationId === conv.conversationId
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedConversation(conv);
                    setUnreadMessages((prev) => ({
                      ...prev,
                      [conv.conversationId]: false,
                    }));
                    localStorage.setItem("selectedConversationId", conv.conversationId);
                  }}
                >
                  <div
                    className="avatar"
                    style={{
                      backgroundColor: conv.theme || "#3b82f6",
                    }}
                  >
                    {conv.friendName.charAt(0).toUpperCase()}
                  </div>
                  <div className="friendInfo">
                    <span className={`friendName ${isUnread ? "unread" : ""}`}>
                      {conv.friendName}
                    </span>
                    {lastMessage && (
                      <span className={`lastMessage ${isUnread ? "unread" : ""}`}>
                        {messagePreview}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="emptyText">Chưa có bạn bè</p>
          )}
        </div>
        <ChatWindow
          selectedConversation={selectedConversation}
          currentUser={currentUser}
          socketRef={socketRef}
          ringtoneRef={ringtoneRef}
          configuration={configuration}
          themes={themes}
          onMessageSent={handleMessageSent}
          onOpenSettingsModal={handleOpenSettingsModal}
          isSettingsModalOpen={isSettingsModalOpen}
          onCloseSettingsModal={handleCloseSettingsModal}
          setSelectedConversation={setSelectedConversation}
        />
      </div>
    </div>
  );
}

export default Chats;