import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import io from "socket.io-client";
import EmojiPicker from "emoji-picker-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import GroupManagement from "./GroupManagement";
import SimplePeer from "simple-peer";
import "./Groups.css";

axios.interceptors.request.use((config) => {
  console.log("Sending request:", config);
  return config;
});

function Groups() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [filePreviewType, setFilePreviewType] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [showManagement, setShowManagement] = useState(false);
  const [userNames, setUserNames] = useState({});
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMessage, setForwardMessage] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("chatTheme") || "light");
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [groupMembers, setGroupMembers] = useState({});
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [newNickname, setNewNickname] = useState("");
  const [lastMessages, setLastMessages] = useState({});
  const [unreadMessages, setUnreadMessages] = useState({});
  const [callActive, setCallActive] = useState(false);
  const [peers, setPeers] = useState({});
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [showMoreOptions, setShowMoreOptions] = useState(null);
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const myVideoRef = useRef(null);
  const peerVideoRefs = useRef({});
  const hoverTimeoutRef = useRef(null);
  const [showMemberInfoModal, setShowMemberInfoModal] = useState(false);

  const themes = {
    light: {
      chatBackground: "#f0f2f5",
      messageOwn: "#0078FF",
      messageOther: "#ffffff",
      textColor: "#333",
      inputBackground: "#ffffff",
      inputBorder: "#d1d9e6",
      headerBackground: "#ffffff",
    },
    dark: {
      chatBackground: "#222222",
      messageOwn: "#333333",
      messageOther: "#333333",
      textColor: "#e0e0e0",
      inputBackground: "#333333",
      inputBorder: "#555555",
      headerBackground: "#222222",
    },
    blue: {
      chatBackground: "#e6f0fa",
      messageOwn: "#0078ff",
      messageOther: "#ffffff",
      textColor: "#333",
      inputBackground: "#ffffff",
      inputBorder: "#d1d9e6",
      headerBackground: "#e6f0fa",
    },
    purple: {
      chatBackground: "#f0e7fa",
      messageOwn: "#6f42c1",
      messageOther: "#ffffff",
      textColor: "#333",
      inputBackground: "#ffffff",
      inputBorder: "#d1d9e6",
      headerBackground: "#f0e7fa",
    },
    pink: {
      chatBackground: "#fae7f0",
      messageOwn: "#e83e8c",
      messageOther: "#ffffff",
      textColor: "#333",
      inputBackground: "#ffffff",
      inputBorder: "#d1d9e6",
      headerBackground: "#fae7f0",
    },
  };

  useEffect(() => {
    localStorage.setItem("chatTheme", theme);
  }, [theme]);

  const fetchFriendNames = async () => {
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/contacts/friends`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const friendMap = {};
      if (Array.isArray(response.data)) {
        response.data.forEach((friend) => {
          if (friend.friendId && friend.friendName) {
            friendMap[friend.friendId] = friend.friendName;
          }
        });
      }
      setUserNames((prev) => ({ ...prev, ...friendMap }));
    } catch (error) {
      console.error("Error fetching friends:", error);
      toast.error("Không thể lấy danh sách bạn bè");
    }
  };

  const fetchMemberDetails = async (groupId) => {
    if (!groupId) return;
    setIsMembersLoading(true);
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      if (!tokens?.accessToken) throw new Error("Invalid token");
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/groups/${groupId}/members`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (response.data && Array.isArray(response.data)) {
        const memberMap = response.data.reduce((acc, member) => {
          if (member.userId) {
            acc[member.userId] = {
              name: member.nickname || member.name || userNames[member.userId] || "Unknown",
              avatar: member.avatar || "👤",
              role: member.role || "member",
            };
          }
          return acc;
        }, {});
        setGroupMembers((prev) => ({ ...prev, [groupId]: memberMap }));
      } else {
        setGroupMembers((prev) => ({ ...prev, [groupId]: {} }));
        toast.error("Invalid member data");
      }
    } catch (error) {
      console.error("Error fetching group members:", error);
      let errorMessage = "Unable to fetch group members";
      if (error.response) {
        if (error.response.status === 401) {
          errorMessage = "Session expired, please reload";
          setTimeout(() => window.location.href = "/login", 2000);
        } else if (error.response.status === 403) {
          errorMessage = "You do not have permission to view group members";
        } else if (error.response.status === 404) {
          errorMessage = "Group not found or endpoint not supported";
        } else if (error.response.data?.error) {
          errorMessage = error.response.data.error;
        }
      } else if (error.message.includes("Network Error")) {
        errorMessage = "Network error, please check your connection";
      }
      toast.error(errorMessage);
      setGroupMembers((prev) => ({ ...prev, [groupId]: {} }));
    } finally {
      setIsMembersLoading(false);
    }
  };

  const getSenderName = (senderId, groupId) => {
    if (senderId === currentUser) return "Bạn";
    if (!senderId) return "Unknown";
    const memberName = groupId && groupMembers[groupId]?.[senderId]?.name;
    const userName = userNames[senderId];
    return memberName || userName || senderId.slice(0, 8);
  };

  const getMessagePreview = (message) => {
    if (!message || !message.content) return "No messages yet";
    if (message.status === "deleted") return "Deleted";
    if (message.type === "recalled") return "Recalled";
    if (message.type === "image" || message.type === "video") return "Media";
    return message.content.length > 20
      ? message.content.substring(0, 20) + "..."
      : message.content;
  };

  const moveGroupToTop = (groupId) => {
    setGroups((prev) => {
      const groupIndex = prev.findIndex((g) => g.groupId === groupId);
      if (groupIndex === -1) return prev;
      const group = prev[groupIndex];
      const updatedGroups = [...prev];
      updatedGroups.splice(groupIndex, 1);
      const newGroups = [group, ...updatedGroups];
      localStorage.setItem("groupOrder", JSON.stringify(newGroups.map(g => g.groupId)));
      return newGroups;
    });
  };
useEffect(() => {
  const handleClickOutside = (event) => {
    // Check if click is outside more options or reaction picker
    const moreOptions = document.querySelector('.more-options1');
    const reactionPicker = document.querySelector('.reaction-picker1');
    const actionButtons = document.querySelectorAll('.action-button1');

    // If more options or reaction picker is open
    if (showMoreOptions || showReactionPicker) {
      // Check if the click is not on the more options, reaction picker, or action buttons
      if (
        (!moreOptions || !moreOptions.contains(event.target)) &&
        (!reactionPicker || !reactionPicker.contains(event.target)) &&
        (!Array.from(actionButtons).some(button => button.contains(event.target)))
      ) {
        setShowMoreOptions(null);
        setShowReactionPicker(null);
      }
    }
  };

  // Add event listener
  document.addEventListener('click', handleClickOutside);

  // Cleanup
  return () => {
    document.removeEventListener('click', handleClickOutside);
  };
}, [showMoreOptions, showReactionPicker]);
  useEffect(() => {
    if (!selectedGroup || !currentUser) return;
    fetchFriendNames();
    fetchMemberDetails(selectedGroup.groupId);
  }, [selectedGroup, currentUser]);

  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken) {
      console.log("No token found, redirecting to login");
      window.location.href = "/login";
      return;
    }

    const fetchUserInfo = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/auth/user`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        setCurrentUser(response.data.username);
      } catch (error) {
        console.error("Error fetching user info:", error);
        toast.error("Unable to fetch user information");
        window.location.href = "/login";
      }
    };

    fetchUserInfo();
  }, []);

  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken || !currentUser) return;

    const fetchGroupsAndMessages = async () => {
      setIsLoading(true);
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/groups`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        let fetchedGroups = response.data;
        const savedOrder = JSON.parse(localStorage.getItem("groupOrder")) || [];
        if (savedOrder.length > 0) {
          fetchedGroups = [...fetchedGroups].sort((a, b) => {
            const aIndex = savedOrder.indexOf(a.groupId);
            const bIndex = savedOrder.indexOf(b.groupId);
            if (aIndex === -1 && bIndex === -1) return 0;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          });
        }
        setGroups(fetchedGroups);

        const lastMessagesTemp = {};
        for (const group of fetchedGroups) {
          try {
            const msgResponse = await axios.get(
              `${process.env.REACT_APP_API_URL}/groups/${group.groupId}/messages`,
              { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
            );
            lastMessagesTemp[group.groupId] = msgResponse.data.length > 0
              ? msgResponse.data[msgResponse.data.length - 1]
              : null;
          } catch (error) {
            console.error(`Error fetching messages for group ${group.groupId}:`, error);
            lastMessagesTemp[group.groupId] = null;
          }
        }
        setLastMessages(lastMessagesTemp);
      } catch (error) {
        console.error("Error refreshing group list:", error.response?.data || error.message);
        toast.error("Unable to refresh group list: " + (error.response?.data?.error || error.message));
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroupsAndMessages();
    window.addEventListener("groupCreated", fetchGroupsAndMessages);
    return () => window.removeEventListener("groupCreated", fetchGroupsAndMessages);
  }, [currentUser]);

  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    if (!tokens?.accessToken || !currentUser) return;

socketRef.current = io(process.env.REACT_APP_SOCKET_URL, {
  auth: { token: tokens.accessToken },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});


    socketRef.current.on("connect", () => {
      console.log("Socket.IO connected successfully");
      groups.forEach((group) => {
        socketRef.current.emit("joinGroup", { groupId: group.groupId });
      });
    });

    socketRef.current.on("reconnect", () => {
      console.log("Socket.IO reconnected successfully");
      groups.forEach((group) => {
        socketRef.current.emit("joinGroup", { groupId: group.groupId });
      });
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
      toast.error("Unable to connect to chat server");
    });

    socketRef.current.on("receiveGroupMessage", (message) => {
      if (message.senderId === currentUser) return;
      if (messages.some((msg) => msg.messageId === message.messageId)) return;

      moveGroupToTop(message.groupId);

      if (message.groupId !== selectedGroup?.groupId) {
        setUnreadMessages((prev) => ({
          ...prev,
          [message.groupId]: (prev[message.groupId] || 0) + 1,
        }));
      }

      setMessages((prev) => [...prev, message]);
      setLastMessages((prev) => ({
        ...prev,
        [message.groupId]: message,
      }));

      if (message.groupId !== selectedGroup?.groupId) {
        const group = groups.find((g) => g.groupId === message.groupId);
        toast.info(`New message in group ${group?.name || message.groupId}`);
      }
    });

    socketRef.current.on("groupMessageRecalled", ({ groupId, timestamp }) => {
      if (groupId === selectedGroup?.groupId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.timestamp === timestamp ? { ...msg, type: "recalled", status: "recalled" } : msg
          )
        );
        toast.success("Group message recalled!");
      }
      setLastMessages((prev) => {
        const lastMsg = prev[groupId];
        if (lastMsg && lastMsg.timestamp === timestamp) {
          return { ...prev, [groupId]: { ...lastMsg, type: "recalled", status: "recalled" } };
        }
        return prev;
      });
    });

    socketRef.current.on("groupMessageDeleted", ({ groupId, timestamp }) => {
      if (groupId === selectedGroup?.groupId) {
        setMessages((prev) =>
          prev.map((msg) => (msg.timestamp === timestamp ? { ...msg, status: "deleted" } : msg))
        );
        toast.success("Group message deleted!");
      }
      setLastMessages((prev) => {
        const lastMsg = prev[groupId];
        if (lastMsg && lastMsg.timestamp === timestamp) {
          return { ...prev, [groupId]: { ...lastMsg, status: "deleted" } };
        }
        return prev;
      });
    });

    socketRef.current.on("groupCreated", (group) => {
      setGroups((prev) => {
        if (prev.some((g) => g.groupId === group.groupId)) return prev;
        const newGroups = [group, ...prev];
        localStorage.setItem("groupOrder", JSON.stringify(newGroups.map(g => g.groupId)));
        return newGroups;
      });
      toast.success(`Group ${group.name} created!`);
    });

    socketRef.current.on("groupUpdated", ({ groupId, newMember, removedMember, updatedMember, role }) => {
      setGroups((prev) =>
        prev.map((group) =>
          group.groupId === groupId
            ? {
                ...group,
                members: newMember
                  ? [...group.members, { userId: newMember, role: "member" }]
                  : removedMember
                  ? group.members.filter((m) => m.userId !== removedMember)
                  : group.members.map((m) => (m.userId === updatedMember ? { ...m, role } : m)),
              }
            : group
        )
      );
      if (selectedGroup?.groupId === groupId) {
        setSelectedGroup((prev) => ({
          ...prev,
          members: newMember
            ? [...prev.members, { userId: newMember, role: "member" }]
            : removedMember
            ? prev.members.filter((m) => m.userId !== removedMember)
            : prev.members.map((m) => (m.userId === updatedMember ? { ...m, role } : m)),
        }));
      }
      const message = newMember
        ? `${userNames[newMember] || newMember} added to the group`
        : removedMember
        ? `${userNames[removedMember] || removedMember} left or was removed from the group`
        : `${userNames[updatedMember] || updatedMember} is now ${role === "admin" ? "admin" : "member"}`;
      toast.info(message);
      fetchMemberDetails(groupId);
    });

    socketRef.current.on("groupDissolved", ({ groupId }) => {
      setGroups((prev) => {
        const newGroups = prev.filter((group) => group.groupId !== groupId);
        localStorage.setItem("groupOrder", JSON.stringify(newGroups.map(g => g.groupId)));
        return newGroups;
      });
      if (selectedGroup?.groupId === groupId) {
        setSelectedGroup(null);
        setMessages([]);
      }
      toast.info("Group dissolved!");
    });

socketRef.current.on("nicknameChanged", ({ groupId, userId, newNickname, changerId, notification }) => {
  if (groupId === selectedGroup?.groupId) {
    setGroupMembers((prev) => ({
      ...prev,
      [groupId]: {
        ...prev[groupId],
        [userId]: {
          ...prev[groupId][userId],
          name: newNickname,
        },
      },
    }));
    const changerName = changerId === currentUser ? "You" : getSenderName(changerId, groupId);
    const userName = userId === currentUser ? "you" : getSenderName(userId, groupId);
    toast.info(`${changerName} changed ${userName}'s nickname to ${newNickname}`);
    // Thêm thông báo vào khung chat
    setMessages((prev) => [
      ...prev,
      {
        groupId,
        senderId: changerId,
        content: notification,
        type: "system",
        timestamp: new Date().toISOString(),
        status: "sent",
      },
    ]);
  }
});

    socketRef.current.on("startVideoCall", ({ groupId }) => {
      if (groupId === selectedGroup?.groupId && !callActive) {
        toast.info("Group video call starting! Click 'Start Video Call' to join.", {
          autoClose: false,
          closeOnClick: true,
          onClick: () => startVideoCall(),
        });
      }
    });

    socketRef.current.on("videoCallEnded", ({ groupId }) => {
      if (groupId === selectedGroup?.groupId && callActive) {
        endVideoCall();
        toast.info("Group video call ended.");
      }
    });

    socketRef.current.on("offer", (data) => {
      if (data.groupId === selectedGroup?.groupId && data.receiverId === currentUser) {
        createPeer(data.senderId, currentUser, data.sdp);
      }
    });

    socketRef.current.on("answer", (data) => {
      if (data.groupId === selectedGroup?.groupId && data.receiverId === currentUser) {
        const peer = peers[data.senderId];
        if (peer) peer.signal(data.sdp);
      }
    });

    socketRef.current.on("candidate", (data) => {
      if (data.groupId === selectedGroup?.groupId) {
        const peer = peers[data.senderId];
        if (peer) peer.signal(data.candidate);
      }
    });

    socketRef.current.on("reactionAdded", ({ groupId, timestamp, userId, reaction }) => {
      if (groupId === selectedGroup?.groupId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.timestamp === timestamp
              ? {
                  ...msg,
                  reactions: {
                    ...msg.reactions,
                    [userId]: reaction,
                  },
                }
              : msg
          )
        );
        const reactorName = userId === currentUser ? "You" : getSenderName(userId, groupId);
        toast.info(`${reactorName} reacted ${reaction} to a message`);
      }
    });

    return () => {
      socketRef.current?.disconnect();
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [currentUser, groups, userNames, messages, groupMembers, peers, selectedGroup]);

  useEffect(() => {
    if (!socketRef.current || !groups.length) return;
    groups.forEach((group) => {
      socketRef.current.emit("joinGroup", { groupId: group.groupId });
    });
  }, [groups]);

  useEffect(() => {
    if (!selectedGroup) return;

    const fetchMessages = async () => {
      setIsLoading(true);
      try {
        const tokens = JSON.parse(localStorage.getItem("tokens"));
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/groups/${selectedGroup.groupId}/messages`,
          { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
        );
        const messagesWithReactions = response.data.map(msg => ({
          ...msg,
          reactions: msg.reactions || {},
        }));
        setMessages(messagesWithReactions);
        if (response.data.length > 0) {
          setLastMessages((prev) => ({
            ...prev,
            [selectedGroup.groupId]: response.data[response.data.length - 1],
          }));
        }
      } catch (error) {
        console.error("Error fetching group messages:", error);
        toast.error("Unable to fetch group messages");
      } finally {
        setIsLoading(false);
      }
    };

    setUnreadMessages((prev) => ({
      ...prev,
      [selectedGroup.groupId]: 0,
    }));

    socketRef.current.emit("joinGroup", { groupId: selectedGroup.groupId });
    fetchMessages();
    setShowSearchBar(false);
    setSearchQuery("");
  }, [selectedGroup]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getFileType = (fileName) => {
    if (!fileName) return "file";
    if (/\.(jpg|jpeg|png|gif)$/i.test(fileName)) return "image";
    if (/\.(mp4|avi|mkv|webm|mov)$/i.test(fileName)) return "video";
    if (/\.(mp3|wav|ogg)$/i.test(fileName)) return "audio";
    return "file";
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && !file) return;

    let messageContent = newMessage;
    let messageType = "text";

    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await axios.post(`${process.env.REACT_APP_API_URL}/upload`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${JSON.parse(localStorage.getItem("tokens")).accessToken}`,
          },
        });
        messageContent = response.data.fileUrl;
        messageType = getFileType(file.name);
      } catch (error) {
        console.error("Error uploading file:", error);
        toast.error("Unable to upload file");
        return;
      }
    }

    const message = {
      groupId: selectedGroup.groupId,
      senderId: currentUser,
      content: messageContent,
      type: messageType,
      timestamp: new Date().toISOString(),
      reactions: {},
    };

    socketRef.current.emit("sendGroupMessage", message);
    setMessages((prev) => [...prev, { ...message, status: "sent" }]);
    setLastMessages((prev) => ({
      ...prev,
      [selectedGroup.groupId]: message,
    }));
    moveGroupToTop(selectedGroup.groupId);
    setNewMessage("");
    setFile(null);
    setFilePreview(null);
    setFilePreviewType(null);
  };

  const handleEmojiClick = (emojiObject) => {
    setNewMessage((prev) => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > 50 * 1024 * 1024) {
        toast.error("File too large, please select a file under 50MB");
        return;
      }
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "video/mp4",
        "video/avi",
        "video/x-matroska",
        "video/webm",
        "video/quicktime",
      ];
      if (!allowedTypes.includes(selectedFile.type)) {
        toast.error("Only JPG, PNG, GIF, MP3, WAV, OGG, MP4, AVI, MKV, WEBM, MOV files are supported");
        return;
      }
      setFile(selectedFile);
      const previewUrl = URL.createObjectURL(selectedFile);
      setFilePreview(previewUrl);
      setFilePreviewType(getFileType(selectedFile.name));
    }
  };

  const handleRecallMessage = (timestamp) => {
    if (window.confirm("Are you sure you want to recall this message?")) {
      socketRef.current.emit("recallGroupMessage", {
        groupId: selectedGroup.groupId,
        timestamp,
      });
      setShowMoreOptions(null);
    }
  };

  const handleDeleteMessage = (timestamp) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.timestamp === timestamp ? { ...msg, status: "deleted" } : msg
        )
      );
      toast.success("Message deleted!");
      setShowMoreOptions(null);
    }
  };

  const handleForwardMessage = (message) => {
    setForwardMessage(message);
    setShowForwardModal(true);
    setShowMoreOptions(null);
  };

  const handleUpdateReaction = (timestamp, newReactions) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.timestamp === timestamp ? { ...msg, reactions: newReactions } : msg
      )
    );
    socketRef.current.emit("addReaction", {
      groupId: selectedGroup.groupId,
      timestamp,
      userId: currentUser,
      reaction: Object.values(newReactions)[0] || null,
    });
  };

  const handleReaction = (emoji) => {
    const userReaction = messages.find((msg) => msg.timestamp === showReactionPicker)?.reactions?.[currentUser] || null;
    if (userReaction === emoji) {
      const newReactions = { ...messages.find((msg) => msg.timestamp === showReactionPicker)?.reactions };
      delete newReactions[currentUser];
      handleUpdateReaction(showReactionPicker, newReactions);
    } else {
      const newReactions = { ...messages.find((msg) => msg.timestamp === showReactionPicker)?.reactions, [currentUser]: emoji };
      handleUpdateReaction(showReactionPicker, newReactions);
    }
    setShowReactionPicker(null);
  };

  const handleForwardToGroup = (newGroupId) => {
    if (!forwardMessage) return;
    socketRef.current.emit("forwardGroupMessage", {
      groupId: selectedGroup.groupId,
      newGroupId,
      content: forwardMessage.content,
      type: forwardMessage.type,
      forwardedFrom: forwardMessage.forwardedFrom,
    });
    toast.success("Message forwarded!");
    setShowForwardModal(false);
    setForwardMessage(null);
  };

  const handleSelectTheme = (newTheme) => {
    setTheme(newTheme);
    setShowThemeModal(false);
  };

  const handleShowSearchBar = () => {
    setShowSettingsModal(false);
    setShowSearchBar(true);
  };

  const handleShowSharedMedia = () => {
    setShowSettingsModal(false);
    setShowSharedMedia(true);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const handleCancelSearch = () => {
    setShowSearchBar(false);
    setSearchQuery("");
  };

  const handleMediaClick = (msg) => {
    if (msg.type === "image" || msg.type === "video") {
      setSelectedMedia(msg);
      setShowMediaPreview(true);
    }
  };

  const filterMessageContent = (content) => {
    if (!content) return "";
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    return content.replace(uuidRegex, "").trim();
  };

  const filteredMessages = messages.filter((msg) => {
    if (msg.status === "deleted" || msg.type === "recalled" || msg.type === "system") return true;
    const content = filterMessageContent(msg.content);
    return content.toLowerCase().includes(searchQuery.toLowerCase());
  });

const handleShowMembersModal = () => {
  if (!selectedGroup) return;
  setShowSettingsModal(false);
  // Only fetch if group members are not already loaded
  if (!groupMembers[selectedGroup.groupId] || Object.keys(groupMembers[selectedGroup.groupId]).length === 0) {
    fetchMemberDetails(selectedGroup.groupId).then(() => {
      setShowMembersModal(true);
    });
  } else {
    setShowMembersModal(true);
  }
};

  const handleOpenNicknameModal = (userId, currentNickname) => {
    setEditingUserId(userId);
    setNewNickname(currentNickname);
    setShowNicknameModal(true);
  };

const handleSaveNickname = async () => {
  if (!newNickname.trim()) {
    toast.error("Please enter a nickname");
    return;
  }

  try {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    const response = await axios.put(
      `${process.env.REACT_APP_API_URL}/groups/${selectedGroup.groupId}/members/${editingUserId}/nickname`,
      { nickname: newNickname },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
    );

    if (response.status === 200) {
      socketRef.current.emit("changeNickname", {
        groupId: selectedGroup.groupId,
        userId: editingUserId,
        newNickname,
        changerId: currentUser,
      });

      setGroupMembers((prev) => ({
        ...prev,
        [selectedGroup.groupId]: {
          ...prev[selectedGroup.groupId],
          [editingUserId]: {
            ...prev[selectedGroup.groupId][editingUserId],
            name: newNickname,
          },
        },
      }));

      setShowNicknameModal(false);
      setEditingUserId(null);
      setNewNickname("");
      toast.success("Nickname updated!");
    } else {
      throw new Error(`Update failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error updating nickname:", error.response?.data || error.message);
    let errorMessage = "Unable to update nickname";
    if (error.response) {
      if (error.response.status === 404) {
        errorMessage = "Endpoint not found. Please check backend configuration.";
      } else if (error.response.status === 400 || error.response.status === 403) {
        errorMessage = error.response.data?.error || "Invalid request or unauthorized";
      } else if (error.response.data?.error) {
        errorMessage = error.response.data.error;
      }
    } else if (error.message.includes("Network Error")) {
      errorMessage = "Network error, please check your connection";
    }
    toast.error(errorMessage);
  }
};

  const startVideoCall = () => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        const myVideo = myVideoRef.current;
        if (myVideo) {
          myVideo.srcObject = stream;
          myVideo.play();
        }

        socketRef.current.emit("startVideoCall", { groupId: selectedGroup.groupId });

        const newPeers = {};
        selectedGroup.members.forEach((member) => {
          if (member.userId !== currentUser) {
            const peer = new SimplePeer({
              initiator: true,
              trickle: false,
              stream: stream,
            });

            peer.on("signal", (data) => {
              socketRef.current.emit("offer", {
                sdp: data,
                senderId: currentUser,
                receiverId: member.userId,
                groupId: selectedGroup.groupId,
              });
            });

            peer.on("stream", (remoteStream) => {
              if (!peerVideoRefs.current[member.userId]) {
                const video = document.createElement("video");
                video.className = "video1";
                video.autoplay = true;
                peerVideoRefs.current[member.userId] = video;
                document.getElementById("video-container")?.appendChild(video);
              }
              peerVideoRefs.current[member.userId].srcObject = remoteStream;
              peerVideoRefs.current[member.userId].play();
            });

            peer.on("error", (err) => {
              console.error("Peer error:", err);
              toast.error("Video connection error with " + getSenderName(member.userId, selectedGroup.groupId));
            });

            newPeers[member.userId] = peer;
          }
        });

        setPeers(newPeers);
        setCallActive(true);
      })
      .catch((err) => {
        console.error("Error accessing media devices:", err);
        toast.error("Unable to access camera or microphone");
      });
  };

  const createPeer = (senderId, receiverId, sdp) => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        const peer = new SimplePeer({
          initiator: false,
          trickle: false,
          stream: stream,
        });

        peer.on("signal", (data) => {
          socketRef.current.emit("answer", {
            sdp: data,
            senderId: receiverId,
            receiverId: senderId,
            groupId: selectedGroup.groupId,
          });
        });

        peer.on("stream", (remoteStream) => {
          if (!peerVideoRefs.current[senderId]) {
            const video = document.createElement("video");
            video.className = "video1";
            video.autoplay = true;
            peerVideoRefs.current[senderId] = video;
            document.getElementById("video-container")?.appendChild(video);
          }
          peerVideoRefs.current[senderId].srcObject = remoteStream;
          peerVideoRefs.current[senderId].play();
        });

        peer.on("error", (err) => {
          console.error("Peer error:", err);
          toast.error("Video connection error with " + getSenderName(senderId, selectedGroup.groupId));
        });

        peer.signal(sdp);
        setPeers((prev) => ({ ...prev, [senderId]: peer }));
      })
      .catch((err) => {
        console.error("Error creating peer:", err);
        toast.error("Error establishing video connection");
      });
  };

  const endVideoCall = () => {
    setCallActive(false);

    Object.entries(peers).forEach(([userId, peer]) => {
      try {
        peer.destroy();
      } catch (err) {
        console.error("Error destroying peer:", err);
      }
    });
    setPeers({});

    if (myVideoRef.current?.srcObject) {
      myVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      myVideoRef.current.srcObject = null;
    }

    Object.values(peerVideoRefs.current).forEach((video) => {
      if (video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
      video.remove();
    });
    peerVideoRefs.current = {};

    const videoContainer = document.getElementById("video-container");
    if (videoContainer) videoContainer.innerHTML = "";

    socketRef.current.emit("videoCallEnded", { groupId: selectedGroup.groupId });
  };

const formatDateLabel = (date) => {
  const today = new Date();
  const messageDate = new Date(date);
  const isToday = messageDate.toDateString() === today.toDateString();
  const isYesterday = new Date(today.setDate(today.getDate() - 1)).toDateString() === messageDate.toDateString();

  if (isToday) return "Hôm nay";
  if (isYesterday) return "Hôm qua";
  return messageDate.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

  const renderMessage = (msg, index) => {
  const isOwnMessage = msg.senderId === currentUser;
  const senderName = getSenderName(msg.senderId, selectedGroup?.groupId);
  const filteredContent = filterMessageContent(msg.content);
  const currentDate = new Date(msg.timestamp).toDateString();
  const prevMessage = index > 0 ? filteredMessages[index - 1] : null;
  const prevDate = prevMessage ? new Date(prevMessage.timestamp).toDateString() : null;
  const showDateLabel = !prevMessage || currentDate !== prevDate;
  const isHovered = hoveredMessageId === msg.timestamp;
  const showOptions = showMoreOptions === msg.timestamp;
  const showReactions = showReactionPicker === msg.timestamp;

  const reactionEmojis = {
    like: "👍",
    heart: "❤️",
    haha: "😂",
    sad: "😢",
    wow: "😮",
    angry: "😣",
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredMessageId(msg.timestamp);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMessageId(null);
    }, 1500);
  };

  const handleReaction = (emoji) => {
    const userReaction = msg.reactions?.[currentUser] || null;
    if (userReaction === emoji) {
      const newReactions = { ...msg.reactions };
      delete newReactions[currentUser];
      handleUpdateReaction(msg.timestamp, newReactions);
    } else {
      const newReactions = { ...msg.reactions, [currentUser]: emoji };
      handleUpdateReaction(msg.timestamp, newReactions);
    }
    setShowReactionPicker(null);
  };

  return (
    <React.Fragment key={index}>
      {showDateLabel && (
        <div className={`date-container1 ${theme === "dark" ? "dark" : ""}`}>
          <div className="dateDivider1" style={{ textAlign: "center", margin: "0 auto" }}>
            {formatDateLabel(msg.timestamp)}
          </div>
        </div>
      )}
      <div
        className="message-container1"
        data-own={isOwnMessage.toString()}
        onMouseEnter={isOwnMessage ? handleMouseEnter : undefined}
        onMouseLeave={isOwnMessage ? handleMouseLeave : undefined}
      >
        {isOwnMessage && isHovered && (
          <div
            className="message-actions1"
            style={{
              display: "flex",
              alignItems: "center",
              position: "absolute",
              left: "-60px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <button
              className="action-button1"
              onClick={() => setShowMoreOptions(showOptions ? null : msg.timestamp)}
              style={{
                background: theme === "dark" ? "#4a4b4c" : "#e0e7ff",
                color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
                border: "none",
                borderRadius: "50%",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "4px",
                cursor: "pointer",
              }}
            >
              ⋮
            </button>
            <button
              className="action-button1"
              onClick={() => setShowReactionPicker(showReactions ? null : msg.timestamp)}
              style={{
                background: theme === "dark" ? "#4a4b4c" : "#e0e7ff",
                color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
                border: "none",
                borderRadius: "50%",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              😊
            </button>
          </div>
        )}
        {showOptions && (
          <div
            className="more-options1"
            style={{
              position: "absolute",
              left: "-120px",
              top: "50%",
              transform: "translateY(-50%)",
              background: theme === "dark" ? "#3a3b3c" : "#ffffff",
              border: `1px solid ${theme === "dark" ? "#4a4b4c" : "#d1d9e6"}`,
              borderRadius: "8px",
              padding: "8px 0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              zIndex: 10,
            }}
          >
            <button
              className="option-button1"
              onClick={() => handleRecallMessage(msg.timestamp)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 16px",
                background: "none",
                border: "none",
                textAlign: "left",
                color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
                cursor: "pointer",
              }}
            >
              Recall
            </button>
            <button
              className="option-button1"
              onClick={() => handleDeleteMessage(msg.timestamp)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 16px",
                background: "none",
                border: "none",
                textAlign: "left",
                color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
            <button
              className="option-button1"
              onClick={() => handleForwardMessage(msg)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 16px",
                background: "none",
                border: "none",
                textAlign: "left",
                color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
                cursor: "pointer",
              }}
            >
              Forward
            </button>
          </div>
        )}
        {showReactions && (
          <div
            className="reaction-picker1"
            style={{
              position: "absolute",
              left: "-180px",
              top: "50%",
              transform: "translateY(-50%)",
              background: theme === "dark" ? "#3a3b3c" : "#ffffff",
              border: `1px solid ${theme === "dark" ? "#4a4b4c" : "#d1d9e6"}`,
              borderRadius: "20px",
              padding: "4px 8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              zIndex: 10,
              display: "flex",
              gap: "4px",
            }}
          >
            {Object.entries(reactionEmojis).map(([key, emoji]) => (
              <button
                key={key}
                className="reaction-button1"
                onClick={() => handleReaction(emoji)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "50%",
                  transition: "transform 0.2s",
                }}
                onMouseEnter={(e) => (e.target.style.transform = "scale(1.2)")}
                onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div
          className={`message1 ${searchQuery && filteredContent.toLowerCase().includes(searchQuery.toLowerCase()) ? "highlighted-message1" : ""}`}
          style={{
            backgroundColor: isOwnMessage ? themes[theme].messageOwn : themes[theme].messageOther,
            color: isOwnMessage ? "#ffffff" : "#000000",
            border: isOwnMessage ? "none" : `1px solid ${themes[theme].inputBorder}`,
            position: "relative",
          }}
        >
          {msg.status === "deleted" ? (
            <i className="status-text1" style={{ color: themes[theme].textColor }}>
              Message deleted
            </i>
          ) : msg.type === "recalled" ? (
            <i className="status-text1" style={{ color: themes[theme].textColor }}>
              Message recalled
            </i>
          ) : msg.type === "system" ? (
            <i className="status-text1" style={{ color: themes[theme].textColor }}>
              {msg.content}
            </i>
          ) : (
            <>
              <div className="sender-name1" style={{ color: themes[theme].textColor }}>
                {senderName}
              </div>
              {msg.forwardedFrom && (
                <div
                  className="forwarded1"
                  style={{ color: theme === "dark" ? "#b0b3b8" : "#6c757d" }}
                >
                  Forwarded from: {getSenderName(msg.forwardedFrom, selectedGroup?.groupId)}
                </div>
              )}
              {msg.type === "image" ? (
                <img
                  src={msg.content}
                  alt="Image"
                  className="image-preview1"
                  onClick={() => handleMediaClick(msg)}
                  onError={(e) => {
                    console.error("Error loading image:", msg.content);
                    toast.error("Unable to load image");
                  }}
                />
              ) : msg.type === "video" ? (
                <video
                  controls
                  className="video-player1"
                  onClick={() => handleMediaClick(msg)}
                >
                  <source
                    src={msg.content}
                    type={msg.content.endsWith(".mp4") ? "video/mp4" : "video/webm"}
                  />
                  Your browser does not support video playback.
                </video>
              ) : msg.type === "audio" ? (
                <audio controls className="audio-player1">
                  <source
                    src={msg.content}
                    type={
                      msg.content.endsWith(".mp3") ? "audio/mpeg" :
                      msg.content.endsWith(".wav") ? "audio/wav" : "audio/ogg"
                    }
                  />
                  Your browser does not support audio playback.
                </audio>
              ) : (
                <span className="message-content1">{msg.content}</span>
              )}
              <div
                className="timestamp1"
                style={{
                  color: isOwnMessage
                    ? "rgba(255,255,255,0.7)"
                    : theme === "dark" ? "#b0b3b8" : "#999999",
                  fontSize: "10px",
                  marginTop: "4px",
                  textAlign: "right",
                }}
              >
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div
                  className="reactions1"
                  style={{
                    display: "flex",
                    gap: "4px",
                    position: "absolute",
                    bottom: "4px",
                    right: "8px",
                    fontSize: "14px",
                  }}
                >
                  {Object.entries(msg.reactions).map(([userId, reaction]) => (
                    <span key={userId} title={getSenderName(userId, selectedGroup?.groupId)}>
                      {reaction}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </React.Fragment>
  );
};

  return (
    <div className="container1">
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
        limit={3}
      />
      <div className="main-content1">
        <div className="sidebar1">
          <h2>Groups</h2>
          <button className="button1" onClick={() => {
            setSelectedGroup(null); // Clear selected group to ensure create mode
            setShowManagement(true);
          }}>
            Tạo nhóm
          </button>
          {isLoading ? (
            <p className="empty-text1">Loading...</p>
          ) : groups.length > 0 ? (
            groups.map((group) => {
    const lastMessage = lastMessages[group.groupId] || {};
    const senderName = getSenderName(lastMessage.senderId, group.groupId);
    const messagePreview = getMessagePreview(lastMessage);
    const unreadCount = unreadMessages[group.groupId] || 0;

    return (
      <div
        key={group.groupId}
        className={`group1 ${selectedGroup?.groupId === group.groupId ? 'selected' : ''}`}
        style={{
          backgroundColor:
            selectedGroup?.groupId === group.groupId ? "#e0e7ff" : "transparent",
        }}
        onClick={() => setSelectedGroup(group)}
      >
        <div className="avatar1">{group.name.charAt(0).toUpperCase()}</div>
        <div className="group-info1">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="group-name1">{group.name}</span>
            {unreadCount > 0 && (
              <span className="unread-badge1">{unreadCount}</span>
            )}
          </div>
          <div className="last-message1">
            <span className="sender-name1">{senderName}:</span>
            <span className="message-preview1">{messagePreview}</span>
          </div>
        </div>
      </div>
    );
  })
) : (
  <p className="empty-text1">No groups available</p>
          )}
        </div>
        <div className="chat-area1" style={{ backgroundColor: themes[theme].chatBackground }}>
          {selectedGroup ? (
            <>
              <div className="chat-header1" style={{ background: themes[theme].headerBackground }}>
                <div className="group-name-wrapper1">
                  <div className="avatar1">{selectedGroup.name.charAt(0).toUpperCase()}</div>
                  <h2
                    className="group-name1"
                    style={{ color: themes[theme].textColor, cursor: "pointer" }}
                    onClick={() => setShowSettingsModal(true)}
                  >
                    {selectedGroup.name}
                  </h2>
                </div>
                <div>
                  {!callActive && (
                    <button
                      className="manage-button1"
                      style={{ marginLeft: "10px" }}
                      onClick={startVideoCall}
                    >
                      Gọi video
                    </button>
                  )}
                  {callActive && (
                    <button
                      className="manage-button1"
                      style={{ marginLeft: "10px", backgroundColor: "#ff4d4f" }}
                      onClick={endVideoCall}
                    >
                      End Call
                    </button>
                  )}
                </div>
              </div>
              {showSearchBar && (
                <div className="search-area1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search messages..."
                    className="search-input1"
                  />
                  {searchQuery && (
                    <button onClick={handleClearSearch} className="clear-search-button1">
                      Clear
                    </button>
                  )}
                  <button onClick={handleCancelSearch} className="cancel-search-button1">
                    Cancel
                  </button>
                </div>
              )}
              <div className="messages1">
                {isLoading ? (
                  <p className="empty-text1" style={{ color: themes[theme].textColor }}>
                    Loading messages...
                  </p>
                ) : filteredMessages.length === 0 ? (
                  <p className="empty-text1" style={{ color: themes[theme].textColor }}>
                    No messages found
                  </p>
                ) : (
                  filteredMessages.map((msg, index) => renderMessage(msg, index))
                )}
                {callActive && (
                  <div id="video-container" className="video-container1">
                    <video ref={myVideoRef} className="video1" muted />
                  </div>
                )}
                <div ref={messagesEndRef} style={{ height: "1px" }} />
              </div>
              <div className="input-area1">
                {showEmojiPicker && (
                  <div className="emoji-picker1">
                    <EmojiPicker onEmojiClick={handleEmojiClick} />
                  </div>
                )}
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="emoji-button1"
                  style={{ color: themes[theme].textColor }}
                >
                  😊
                </button>
                <label
                  className="file-button1"
                  style={{ color: themes[theme].textColor }}
                  title="Select JPG, PNG, GIF, MP3, WAV, OGG, MP4, AVI, MKV, WEBM, MOV files (max 50MB)"
                >
                  📎
                  <input
                    type="file"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                    accept="image/jpeg,image/png,image/gif,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/avi,video/x-matroska,video/webm,video/quicktime"
                  />
                </label>
                {filePreview && (
                  <div style={{ marginRight: "10px", display: "flex", alignItems: "center" }}>
                    {filePreviewType === "image" && (
                      <img
                        src={filePreview}
                        alt="Preview"
                        style={{ maxWidth: "80px", maxHeight: "80px", borderRadius: "8px" }}
                      />
                    )}
                    {filePreviewType === "video" && (
                      <video
                        controls
                        src={filePreview}
                        style={{ maxWidth: "80px", maxHeight: "80px" }}
                      />
                    )}
                    {filePreviewType === "audio" && (
                      <audio controls src={filePreview} style={{ maxWidth: "100px" }} />
                    )}
                    <button
                      onClick={() => {
                        setFile(null);
                        setFilePreview(null);
                        setFilePreviewType(null);
                      }}
                      style={{
                        marginLeft: "5px",
                        color: theme === "dark" ? "#ff6b6b" : "#ff4d4f",
                        background: "none",
                        border: "none",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="input1"
                  style={{
                    backgroundColor: themes[theme].inputBackground,
                    borderColor: themes[theme].inputBorder,
                    color: themes[theme].textColor,
                  }}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                />
                <button
                  className="send-button1"
                  onClick={handleSendMessage}
                  style={{ backgroundColor: themes[theme].messageOwn }}
                >
                  Send
                </button>
              </div>
            </>
          ) : (
            <div
              className="empty-chat1"
              style={{ backgroundColor: themes[theme].chatBackground, color: themes[theme].textColor }}
            >
              Select a group to start
            </div>
          )}
        </div>
      </div>
      {showManagement && (
        <GroupManagement
          group={null} // Always pass null to force create mode
          onClose={() => {
            setShowManagement(false);
            setSelectedGroup(selectedGroup); // Restore selected group if needed
          }}
          currentUser={currentUser}
          allowNonAdminAddMembers={true}
        />
      )}
      {showSettingsModal && (
        <div className="modal-overlay1">
          <div className="modal1">
            <h2 className="modal-title1">Tùy chỉnh đoạn chat</h2>
            <div className="profile-header1">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  className="avatar1"
                  style={{
                    backgroundColor: themes[theme].messageOwn,
                    width: "40px",
                    height: "40px",
                    fontSize: "18px",
                    border: "2px solid #ffffff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  {selectedGroup?.name.charAt(0).toUpperCase()}
                </div>
                <h3 className="modal-header-name1">{selectedGroup.name}</h3>
              </div>
            </div>
            <div className="settings-options1">
              {[
                { text: "Tìm kiếm tin nhắn", emoji: "🔍", action: handleShowSearchBar },
                { text: "Chọn chủ đề", emoji: "🎨", action: () => setShowThemeModal(true) },
                { text: "Quản lý nhóm", emoji: "👥", action: handleShowMembersModal },
                { text: "Xem ảnh/video & files", emoji: "📷", action: handleShowSharedMedia },
              ].map((option, index) => (
                <button
                  key={index}
                  className="settings-button1"
                  style={{
                    borderBottom: index < 3 ? "1px solid #e0e0e0" : "none",
                    color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
                    backgroundColor: option.text === "View Members" && showMembersModal ? (theme === "dark" ? "#4a4b4c" : "#e0e7ff") : "transparent",
                    transition: "background-color 0.2s, transform 0.1s",
                  }}
                  onClick={() => {
                    option.action();
                    if (option.text !== "Change Theme") setShowSettingsModal(false);
                  }}
                  onMouseEnter={(e) => (e.target.style.backgroundColor = theme === "dark" ? "#4a4b4c" : "#f0f4f8")}
                  onMouseLeave={(e) => (e.target.style.backgroundColor = option.text === "View Members" && showMembersModal ? (theme === "dark" ? "#4a4b4c" : "#e0e7ff") : "transparent")}
                >
                  <span className="settings-icon1">{option.emoji}</span> {option.text}
                </button>
              ))}
            </div>
            <button className="modal-button1" onClick={() => setShowSettingsModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {showThemeModal && (
        <div className="modal-overlay1">
          <div className="modal1">
            <h2 className="modal-title1">Select Theme</h2>
            <div className="theme-picker1">
              {Object.keys(themes).map((themeName) => (
                <div
                  key={themeName}
                  className="theme-option1"
                  style={{ backgroundColor: themes[themeName].chatBackground }}
                  onClick={() => handleSelectTheme(themeName)}
                >
                  {themeName.charAt(0).toUpperCase() + themeName.slice(1)}
                </div>
              ))}
            </div>
            <button className="modal-button1" onClick={() => setShowThemeModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {showMembersModal && (
        <div className="modal-overlay1">
          <div className="modal1 members-modal1">
            <h2 className="modal-title1">
              <span className="modal-icon1">👥</span> Quản lý nhóm
            </h2>
            <div className="member-list1">
              {isMembersLoading ? (
                <p className="empty-text1">Loading...</p>
              ) : selectedGroup && groupMembers[selectedGroup.groupId] && Object.keys(groupMembers[selectedGroup.groupId]).length > 0 ? (
                Object.entries(groupMembers[selectedGroup.groupId]).map(([userId, member]) => (
                  <div key={userId} className="member-item1">
                    <div className="member-avatar1">{member.avatar || member.name.charAt(0).toUpperCase()}</div>
<div className="member-info1" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingRight: "25px" }}>                      <span className="member-name1">
                        {member.name === "Khamm" ? `${member.name} (bạn)` : member.name}
                        {member.role === "admin" && <span className="admin-label1"> (Admin)</span>}
                      </span>
                      <button
                        className="option-button1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMoreOptions(showMoreOptions === userId ? null : userId);
                        }}
style={{
        background: "none",
        border: "none",
        color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
        cursor: "pointer",
        fontSize: "18px",
        padding: "4px 8px",
        marginLeft: "15px",
        marginRight: "5px",
        borderRadius: "4px",
        transition: "transform 0.2s",
      }}
    >
                        ▼
                      </button>
                      {showMoreOptions === userId && (
      <div
        className="member-options1"
        style={{
          position: "absolute",
          right: "10px",
          top: "100%",
          background: theme === "dark" ? "#3a3b3c" : "#ffffff",
          border: `1px solid ${theme === "dark" ? "#4a4b4c" : "#d1d9e6"}`,
          borderRadius: "8px",
          padding: "8px 0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          zIndex: 10,
          minWidth: "120px",
        }}
      >
                          <button
          className="option-button1"
          onClick={() => handleOpenNicknameModal(userId, member.name)}
          style={{
            display: "block",
            width: "100%",
            padding: "8px 16px",
            background: "none",
            border: "none",
            textAlign: "left",
            color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
            cursor: "pointer",
          }}
        >
          Đổi biệt hiệu
        </button>
                         <button
          className="option-button1"
          onClick={() => {
            if (window.confirm(`Bạn có chắc muốn mời ${member.name} ra khỏi nhóm?`)) {
              socketRef.current.emit("removeGroupMember", {
                groupId: selectedGroup.groupId,
                userId: userId,
              });
              setShowMoreOptions(null);
            }
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "8px 16px",
            background: "none",
            border: "none",
            textAlign: "left",
            color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
            cursor: "pointer",
          }}
        >
          Mời ra khỏi nhóm
        </button>
                         <button
          className="option-button1"
          onClick={() => {
            setShowMemberInfoModal(userId);
            setShowMoreOptions(null);
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "8px 16px",
            background: "none",
            border: "none",
            textAlign: "left",
            color: theme === "dark" ? "#e4e6eb" : "#1a3c61",
            cursor: "pointer",
          }}
        >
          Xem thông tin
        </button>
      </div>
    )}
  </div>
</div>
                ))
              ) : (
                <p className="empty-text1">No members available</p>
              )}
            </div>
            <div className="modal-actions1">
              <button
                className="modal-button1 back-button1"
                onClick={() => {
                  setShowMembersModal(false);
                  setShowSettingsModal(true);
                }}
              >
                Back
              </button>
              <button
                className="modal-button1 close-button1"
                onClick={() => setShowMembersModal(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {showNicknameModal && (
        <div className="modal-overlay1">
          <div className="modal1 nickname-modal1">
            <h2 className="modal-title1">Đổi biệt hiệu</h2>
            <p className="modal-text1">
              Đổi biệt hiệu cho {groupMembers[selectedGroup?.groupId]?.[editingUserId]?.name || "thành viên"}
            </p>
            <input
              type="text"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="Nhập biệt hiệu mới..."
              className="input1 nickname-input1"
            />
            <div className="modal-actions1">
              <button
                className="modal-button1 save-button1"
                onClick={handleSaveNickname}
              >
                Lưu
              </button>
              <button
                className="modal-button1 cancel-button1"
                onClick={() => {
                  setShowNicknameModal(false);
                  setEditingUserId(null);
                  setNewNickname("");
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
      {showSharedMedia && (
        <div className="modal-overlay1">
          <div className="modal-content1">
            <h2 className="modal-title1">
              <span className="modal-icon1">📸</span> Photos/Videos & Files
            </h2>
            <div className="media-content1">
              {messages.some((msg) => ["image", "video", "audio"].includes(msg.type)) ? (
                <div className="media-grid1">
                  {messages
                    .filter((msg) => ["image", "video", "audio"].includes(msg.type))
                    .map((msg, index) => (
                      <div key={index} className="media-item1">
                        {msg.type === "image" && (
                          <img
                            src={msg.content}
                            alt="Thumbnail"
                            className="thumbnail1"
                            onClick={() => handleMediaClick(msg)}
                            onError={() => toast.error("Failed to load image")}
                          />
                        )}
                        {msg.type === "video" && (
                          <video
                            src={msg.content}
                            className="thumbnail1"
                            controls
                            onClick={() => handleMediaClick(msg)}
                          />
                        )}
                        {msg.type === "audio" && (
                          <audio src={msg.content} controls className="audio-file1" />
                        )}
                        <div className="media-timestamp1">
                          {new Date(msg.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="empty-text1">No photos, videos, or files shared yet</p>
              )}
            </div>
            <button
              className="modal-button1"
              onClick={() => {
                setShowSharedMedia(false);
                setShowSettingsModal(true);
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
      {showMediaPreview && selectedMedia && (
        <div className="media-preview-modal1">
          <div className="media-preview-content1">
            <button
              className="close-button1"
              onClick={() => {
                setShowMediaPreview(false);
                setSelectedMedia(null);
              }}
            >
              ✕
            </button>
            {selectedMedia.type === "image" && (
              <img
                src={selectedMedia.content}
                alt="Media preview"
                className="media-preview-image1"
                onError={() => toast.error("Unable to load image")}
              />
            )}
            {selectedMedia.type === "video" && (
              <video
                controls
                autoPlay
                src={selectedMedia.content}
                className="media-preview-video1"
              />
            )}
            <div className="media-preview-timestamp1">
              {new Date(selectedMedia.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      )}
      {showForwardModal && (
        <div className="modal-overlay1">
          <div className="modal-content1">
            <h2 className="modal-title1">Forward Message</h2>
            <p className="modal-text1">Select a group to forward to</p>
            <div className="group-list1">
              {groups
                .filter((group) => group.groupId !== selectedGroup?.groupId)
                .map((group) => (
                  <div
                    key={group.groupId}
                    className="group-option1"
                    onClick={() => handleForwardToGroup(group.groupId)}
                  >
                    <div className="avatar1">{group.name.charAt(0).toUpperCase()}</div>
                    <span className="group-name1">{group.name}</span>
                  </div>
                ))}
              {groups.filter((group) => group.groupId !== selectedGroup?.groupId).length === 0 && (
                <p className="empty-text1">No groups available to forward to</p>
              )}
            </div>
            <button
              className="modal-button1"
              style={{ backgroundColor: "#ff4d4f" }}
              onClick={() => {
                setShowForwardModal(false);
                setForwardMessage(null);
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Groups;