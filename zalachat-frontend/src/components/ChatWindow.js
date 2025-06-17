import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import EmojiPicker from "emoji-picker-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Chats.css";
import { v4 as uuidv4 } from "uuid";

function ChatWindow({
  selectedConversation,
  currentUser,
  socketRef,
  ringtoneRef,
  configuration,
  themes,
  onMessageSent,
  setSelectedConversation,
}) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [filePreviewType, setFilePreviewType] = useState(null);
  const [callState, setCallState] = useState(null);
  const [callType, setCallType] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [callStartTime, setCallStartTime] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nickname, setNickname] = useState("");
  const [profile, setProfile] = useState(null);
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMessage, setForwardMessage] = useState(null);
  const [showMoreOptions, setShowMoreOptions] = useState(null);
  const [showReactionModal, setShowReactionModal] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioChunksRef = useRef([]);

useEffect(() => {
  if (selectedConversation && socketRef.current) {
    socketRef.current.emit("joinConversation", {
      conversationId: selectedConversation.conversationId,
    });

    socketRef.current.on("receiveMessage", (message) => {
      setMessages((prev) => [...prev, message]);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      if (message.senderId !== currentUser && message.senderId !== "system") {
        toast.info(`Tin nhắn mới từ ${selectedConversation.friendName}`);
      }
    });

    socketRef.current.on("lastMessageUpdated", ({ conversationId, lastMessage }) => {
      if (conversationId === selectedConversation.conversationId && onMessageSent) {
        onMessageSent(conversationId, lastMessage);
      }
    });

    socketRef.current.on("messagesRead", ({ conversationId, userId }) => {
      if (conversationId === selectedConversation.conversationId && userId !== currentUser) {
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            readBy: [...(msg.readBy || []), userId],
          }))
        );
      }
    });
socketRef.current.on("messageReacted", ({ conversationId, timestamp, reaction }) => {
  setMessages((prev) =>
    prev.map((msg) =>
      msg.timestamp === timestamp ? { ...msg, reaction } : msg
    )
  );
});
    socketRef.current.on("themeChanged", ({ conversationId, newTheme, from }) => {
      if (conversationId === selectedConversation.conversationId && from !== currentUser) {
        localStorage.setItem(`theme_${conversationId}`, newTheme);
        setSelectedConversation((prev) => ({ ...prev, theme: newTheme }));
      }
    });

    socketRef.current.on("nicknameChanged", ({ conversationId, newNickname }) => {
      if (conversationId === selectedConversation.conversationId) {
        localStorage.setItem(`nickname_${conversationId}`, newNickname);
        setSelectedConversation((prev) => ({ ...prev, friendName: newNickname }));
      }
    });

    socketRef.current.on("messageSent", (response) => {
      if (response.error) {
        toast.error(response.error);
        setMessages((prev) =>
          prev.filter((msg) => msg.messageId !== response.messageId)
        );
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.messageId === response.messageId ? { ...msg, status: "sent" } : msg
          )
        );
      }
    });

    socketRef.current.on("error", (error) => {
      toast.error(error.message || "Đã xảy ra lỗi");
    });

    socketRef.current.on("messageRecalled", ({ conversationId, timestamp }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.timestamp === timestamp ? { ...msg, type: "recalled", status: "recalled" } : msg
        )
      );
    });

    socketRef.current.on("messageDeleted", ({ conversationId, timestamp }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.timestamp === timestamp ? { ...msg, status: "deleted" } : msg
        )
      );
    });

    fetchMessages();
    fetchUserProfile(selectedConversation.friendId);
    setShowSearchBar(false);
    setSearchQuery("");

    // Mark messages as read when conversation is opened
    socketRef.current.emit("markAsRead", {
      conversationId: selectedConversation.conversationId,
      userId: currentUser,
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("receiveMessage");
        socketRef.current.off("lastMessageUpdated");
        socketRef.current.off("messagesRead");
        socketRef.current.off("themeChanged");
        socketRef.current.off("nicknameChanged");
        socketRef.current.off("messageSent");
        socketRef.current.off("error");
        socketRef.current.off("messageRecalled");
        ssocketRef.current.off("messageDeleted", handleMessageDeleted); 
      }
    };
  }
}, [selectedConversation, socketRef, currentUser, onMessageSent]);

  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
      setRecordingDuration(0);
    }
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const initializePeerConnection = () => {
    const pc = new RTCPeerConnection(configuration);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) =>
        pc.addTrack(track, localStreamRef.current)
      );
    }
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteStreamRef.current = event.streams[0];
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("iceCandidate", {
          to: selectedConversation.friendId,
          conversationId: selectedConversation.conversationId,
          candidate: event.candidate,
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected") {
        cleanupCall(pc);
      }
    };
    setPeerConnection(pc);
    return pc;
  };

  const getUserMedia = async (isVideo) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { facingMode: "user" } : false,
      });
      if (!stream.getAudioTracks().length) {
        throw new Error("No audio track available");
      }
      if (isVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      toast.error("Không thể truy cập thiết bị media");
      return null;
    }
  };

  const playRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.src = "/ringtone.mp3";
      ringtoneRef.current.loop = true;
      ringtoneRef.current
        .play()
        .catch((error) => toast.error("Không thể phát nhạc chuông"));
    }
  };

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    let timer;
    if (callState === "active" && callStartTime) {
      timer = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
      if (callState !== "active") setCallDuration(0);
    };
  }, [callState, callStartTime]);

  const fetchMessages = async () => {
  if (!selectedConversation) return;
  try {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    const response = await axios.get(
      `${process.env.REACT_APP_API_URL}/chats/messages/${selectedConversation.conversationId}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
    );
    setMessages(response.data);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error("Error fetching messages:", error);
    if (error.response?.status === 401) {
      toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
    } else {
      toast.error("Không thể tải tin nhắn");
    }
  }
};

const fetchUserProfile = async (userId) => {
  try {
    const tokens = JSON.parse(localStorage.getItem("tokens"));
    const response = await axios.get(
      `${process.env.REACT_APP_API_URL}/auth/user/${userId}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
    );
    setProfile(response.data);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    if (error.response?.status === 401) {
      toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
    } else {
      toast.error("Không thể tải thông tin cá nhân");
    }
  }
};

  const handleStartCall = async (type) => {
    if (!selectedConversation || callState || peerConnection) return;
    setCallType(type);
    setCallState("outgoing");
    playRingtone();
    const pc = initializePeerConnection();
    const stream = await getUserMedia(type === "video");
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("callRequest", {
        to: selectedConversation.friendId,
        conversationId: selectedConversation.conversationId,
        callType: type,
      });
    } else cleanupCall(pc);
  };

  const handleAcceptCall = async () => {
    if (!socketRef.current?.connected || !selectedConversation) return;
    stopRingtone();
    socketRef.current.emit("callResponse", {
      to: selectedConversation.friendId,
      conversationId: selectedConversation.conversationId,
      accepted: true,
    });
    const pc = initializePeerConnection();
    const stream = await getUserMedia(callType === "video");
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      setCallState("active");
      setCallStartTime(new Date());
    } else {
      socketRef.current.emit("callEnd", {
        conversationId: selectedConversation.conversationId,
        to: selectedConversation.friendId,
      });
      cleanupCall(pc);
    }
  };

  const cleanupCall = (pc) => {
    setCallDuration(0);
    stopRingtone();
    if (localStreamRef.current)
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    if (remoteStreamRef.current)
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (pc) pc.close();
    setPeerConnection(null);
    setCallState(null);
    setCallType(null);
    setCallStartTime(null);
  };

  const handleRejectCall = () => {
    socketRef.current.emit("callResponse", {
      to: selectedConversation.friendId,
      conversationId: selectedConversation.conversationId,
      accepted: false,
    });
    cleanupCall(null);
  };

  const handleEndCall = () => {
    socketRef.current.emit("callEnd", {
      conversationId: selectedConversation.conversationId,
      to: selectedConversation.friendId,
    });
    cleanupCall(peerConnection);
  };

const handleSendMessage = async () => {
  if (!selectedConversation || !socketRef.current?.connected) return;

  let messageContent = newMessage.trim();
  let messageType = "text";

  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      console.log("Đang tải file:", {
        name: file.name,
        type: file.type,
        size: file.size,
      });
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }
      );
      messageContent = response.data.fileUrl;
      messageType = getFileType(file.name);
    } catch (error) {
      console.error("Lỗi khi tải file:", error.response?.data || error.message);
      if (error.response?.status === 401) {
        toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
      } else {
        toast.error(error.response?.data?.message || "Không thể tải file lên. Vui lòng thử lại.");
      }
      return;
    }
  } else if (audioBlob) {
    if (!audioBlob.size) {
      toast.error("Tin nhắn thoại rỗng, vui lòng ghi âm lại.");
      setAudioBlob(null);
      setAudioPreviewUrl(null);
      setIsRecording(false);
      return;
    }
    const formData = new FormData();
    const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
      type: "audio/webm",
    });
    formData.append("file", audioFile);
    try {
      console.log("Đang tải tin nhắn thoại:", {
        name: audioFile.name,
        type: audioFile.type,
        size: audioFile.size,
      });
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${tokens.accessToken}`,
          },
          timeout: 10000,
        }
      );
      messageContent = response.data.fileUrl;
      messageType = "audio";
    } catch (error) {
      console.error("Lỗi khi tải tin nhắn thoại:", error.response?.data || error.message);
      if (error.response?.status === 401) {
        toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
      } else {
        toast.error(
          error.response?.data?.message?.includes("Bucket")
            ? "Lỗi máy chủ khi tải tin nhắn thoại. Vui lòng liên hệ hỗ trợ."
            : error.response?.data?.message || "Không thể tải tin nhắn thoại. Vui lòng thử lại."
        );
      }
      setAudioBlob(null);
      setAudioPreviewUrl(null);
      setIsRecording(false);
      return;
    }
  } else if (!messageContent) {
    return;
  }

  const messageId = uuidv4();
  const message = {
    conversationId: selectedConversation.conversationId,
    messageId,
    senderId: currentUser,
    receiverId: selectedConversation.friendId,
    content: messageContent,
    type: messageType,
    timestamp: new Date().toISOString(),
  };

  socketRef.current.emit("sendMessage", message, (response) => {
    if (response?.error) {
      toast.error(response.error);
      setMessages((prev) =>
        prev.filter((msg) => msg.messageId !== messageId)
      );
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.messageId === messageId ? { ...msg, status: "sent", messageId: response.messageId } : msg
        )
      );
    }
  });

  setMessages((prev) => [...prev, { ...message, status: "sending" }]);
  setNewMessage("");
  setFile(null);
  setFilePreview(null);
  setFilePreviewType(null);
  setAudioBlob(null);
  setAudioPreviewUrl(null);
  setIsRecording(false);
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  if (onMessageSent) {
    onMessageSent(selectedConversation.conversationId, message);
  }
};

  const handleEmojiClick = (emojiObject) => {
    setNewMessage((prev) => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.size > 50 * 1024 * 1024) {
      toast.error("File quá lớn, vui lòng chọn file dưới 50MB");
      return;
    }
    if (selectedFile) {
      setFile(selectedFile);
      const previewUrl = URL.createObjectURL(selectedFile);
      setFilePreview(previewUrl);
      setFilePreviewType(getFileType(selectedFile.name));
    }
  };

  const handleStartRecording = async () => {
    if (isRecording || !selectedConversation) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start();
      setIsRecording(true);
      setMediaRecorder(recorder);
      toast.info("Đang ghi âm...", { autoClose: false });
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error("Không thể bắt đầu ghi âm");
    }
  };

  const handleStopRecordingAndSend = async () => {
    if (!isRecording || !mediaRecorder) return;

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      setAudioBlob(blob);
      setIsRecording(false);
      toast.dismiss();
      const previewUrl = URL.createObjectURL(blob);
      setAudioPreviewUrl(previewUrl);
      audioChunksRef.current = [];
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      if (blob && blob.size > 0) {
        await handleSendMessage();
      } else {
        toast.error("Ghi âm không hợp lệ, vui lòng thử lại.");
        setAudioBlob(null);
        setAudioPreviewUrl(null);
      }
    };
    mediaRecorder.stop();
  };

  const handleCancelRecording = () => {
    if (!isRecording || !mediaRecorder) return;
    mediaRecorder.stop();
    setIsRecording(false);
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    toast.dismiss();
    audioChunksRef.current = [];
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  };

const handleRecallMessage = (timestamp) => {
  if (!window.confirm("Bạn có chắc chắn muốn thu hồi tin nhắn này?")) return;
  socketRef.current.emit("recallMessage", {
    conversationId: selectedConversation.conversationId,
    timestamp,
  });
  setShowMoreOptions(null);
};

const handleDeleteMessage = (timestamp) => {
  if (!window.confirm("Bạn có chắc chắn muốn xóa tin nhắn này?")) return;
  socketRef.current.emit("deleteMessage", {
    conversationId: selectedConversation.conversationId,
    timestamp,
    userId: currentUser,
  });
  setShowMoreOptions(null);
}

  const handleForwardMessage = (msg) => {
    setForwardMessage(msg);
    setShowForwardModal(true);
    setShowMoreOptions(null);
  };

  const handleForwardToConversation = (conv) => {
    if (forwardMessage) {
      const forwardedMessage = {
        ...forwardMessage,
        conversationId: conv.conversationId,
        receiverId: conv.friendId,
        forwardedFrom: currentUser,
        forwardedName: selectedConversation.friendName,
      };
      socketRef.current.emit("forwardMessage", forwardedMessage);
      setShowForwardModal(false);
      setForwardMessage(null);
    }
  };

const handleChangeTheme = (themeColor) => {
  localStorage.setItem(`theme_${selectedConversation.conversationId}`, themeColor);
  socketRef.current.emit("themeChanged", {
    from: currentUser,
    newTheme: themeColor,
    conversationId: selectedConversation.conversationId,
  });
  setSelectedConversation((prev) => ({ ...prev, theme: themeColor }));
  setShowThemeModal(false);
  setShowSettingsModal(true);

  const systemMessage = {
    conversationId: selectedConversation.conversationId,
    senderId: currentUser,
    receiverId: selectedConversation.friendId,
    content: "Bạn đã thay đổi chủ đề màu sắc",
    type: "system",
    timestamp: new Date().toISOString(),
    status: "sent",
  };
  socketRef.current.emit("sendMessage", systemMessage, (response) => {
    if (response?.error) {
      toast.error(response.error);
      setMessages((prev) =>
        prev.filter((msg) => msg.timestamp !== systemMessage.timestamp)
      );
    }
  });
  setMessages((prev) => [...prev, systemMessage]);
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
};

const handleSetNickname = () => {
  if (!nickname.trim()) {
    toast.error("Biệt hiệu không được để trống!");
    return;
  }

  socketRef.current.emit("nicknameChanged", {
    conversationId: selectedConversation.conversationId,
    newNickname: nickname,
  }, (response) => {
    if (response?.success) {
      localStorage.setItem(`nickname_${selectedConversation.conversationId}`, nickname);
      setSelectedConversation((prev) => ({
        ...prev,
        friendName: nickname,
      }));
      setShowNicknameModal(false);
      setNickname("");

      const systemMessage = {
        conversationId: selectedConversation.conversationId,
        senderId: currentUser,
        receiverId: selectedConversation.friendId,
        content: `Bạn đã đổi biệt hiệu của ${profile?.name || selectedConversation.friendName} thành ${nickname}`,
        type: "system",
        timestamp: new Date().toISOString(),
        status: "sent",
      };
      socketRef.current.emit("sendMessage", systemMessage, (msgResponse) => {
        if (msgResponse?.error) {
          toast.error(msgResponse.error);
          setMessages((prev) =>
            prev.filter((msg) => msg.timestamp !== systemMessage.timestamp)
          );
        } else {
          setMessages((prev) => [...prev, systemMessage]);
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      });
      setShowSettingsModal(true);
    } else {
      toast.error(response?.error || "Đổi biệt hiệu thất bại!");
    }
  });
};

  const handleShowSearchBar = () => {
    setShowSearchBar(true);
    setShowSettingsModal(false);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCancelSearch = () => {
    setShowSearchBar(false);
    setSearchQuery("");
  };

  const handleShowSharedMedia = () => {
    setShowSharedMedia(true);
  };

  const handleMediaClick = (media) => {
    setSelectedMedia(media);
    setShowMediaPreview(true);
  };

  const getFileType = (url) => {
    if (/\.(jpg|jpeg|png|gif)$/i.test(url)) return "image";
    if (/\.(mp3|wav|ogg|webm)$/i.test(url)) return "audio";
    if (/\.(mp4|avi|mkv|webm|mov)$/i.test(url)) return "video";
    return "file";
  };

  const filterMessageContent = (content) => {
    return content.replace(/<[^>]+>/g, "").replace(/\*(.*?)\*/g, "$1");
  };

  const isDifferentDay = (date1, date2) => {
    if (!date1 || !date2) return true;
    return (
      date1.getFullYear() !== date2.getFullYear() ||
      date1.getMonth() !== date2.getMonth() ||
      date1.getDate() !== date2.getDate()
    );
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const handleSearchMessages = () => {
    if (!searchQuery.trim()) {
      toast.error("Vui lòng nhập nội dung tìm kiếm");
      return;
    }
    const firstMatch = messages.find((msg) =>
      filterMessageContent(msg.content)
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    );
    if (firstMatch) {
      const messageElement = document.querySelector(
        `.messageContainer[data-timestamp="${firstMatch.timestamp}"]`
      );
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      toast.info("Không tìm thấy tin nhắn phù hợp");
    }
  };

 const handleShowMoreOptions = (messageId) => {
  setShowMoreOptions(messageId === showMoreOptions ? null : messageId);
};

const handleReact = (messageId) => {
  setShowReactionModal(messageId);
};

const handleSendReaction = (reaction) => {
  if (showReactionModal) {
    const message = messages.find((msg) => msg.messageId === showReactionModal);
    if (message) {
      if (message.reaction === reaction) {
        const updatedMessage = { ...message, reaction: null };
        socketRef.current.emit("reactMessage", {
          conversationId: selectedConversation.conversationId,
          timestamp: message.timestamp,
          reaction: null,
        });
        setMessages((prev) =>
          prev.map((msg) =>
            msg.messageId === showReactionModal ? updatedMessage : msg
          )
        );
      } else {
        const updatedMessage = { ...message, reaction };
        socketRef.current.emit("reactMessage", {
          conversationId: selectedConversation.conversationId,
          timestamp: message.timestamp,
          reaction,
        });
        setMessages((prev) =>
          prev.map((msg) =>
            msg.messageId === showReactionModal ? updatedMessage : msg
          )
        );
      }
      setShowReactionModal(null);
    }
  }
};

  return (
    <div className="chatArea" style={{ backgroundColor: selectedConversation?.theme || '#ffffff' }}>
      {selectedConversation ? (
        <>
          <div className="chatHeader">
            <div
              className="avatar"
              style={{
                backgroundColor: selectedConversation.theme || "#3b82f6",
              }}
            >
              {selectedConversation.friendName.charAt(0).toUpperCase()}
            </div>
            <h2
              className="friendNameClickable"
              onClick={() => setShowSettingsModal(true)}
            >
              {selectedConversation.friendName}
            </h2>
            <div className="callButtons">
              <button
                onClick={() => handleStartCall("voice")}
                className="callButton"
                disabled={callState}
                title="Gọi thoại"
              >
                📞
              </button>
              <button
                onClick={() => handleStartCall("video")}
                className="callButton"
                disabled={callState}
                title="Gọi video"
              >
                📹
              </button>
            </div>
          </div>
          {showSearchBar && (
            <div className="searchArea">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm tin nhắn..."
                className="searchInput"
              />
              <button onClick={handleCancelSearch} className="cancelSearchButton">
                Hủy
              </button>
            </div>
          )}
<div className="messages">
  {messages
    .filter((msg) =>
      searchQuery
        ? msg.type !== "audio" &&
          filterMessageContent(msg.content)
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
        : true
    )
    .map((msg, index) => {
      const isOwnMessage = msg.senderId === currentUser;
      const senderName = isOwnMessage
        ? "Bạn"
        : selectedConversation.friendName;
      const filteredContent = filterMessageContent(msg.content);
      const currentMsgDate = new Date(msg.timestamp);
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const prevMsgDate = prevMsg ? new Date(prevMsg.timestamp) : null;
      const showDate = isDifferentDay(currentMsgDate, prevMsgDate);
      const isRead = msg.readBy && msg.readBy.includes(selectedConversation.friendId);

      return (
        <div key={msg.messageId || index}>
          {showDate && (
            <div className="dateDivider">
              {formatDate(currentMsgDate)}
            </div>
          )}
          <div
            className={`messageContainer ${isOwnMessage ? "ownMessage" : ""}`}
            data-timestamp={msg.timestamp}
          >
            <div className="messageWrapper">
              <div
                className={`message ${
                  searchQuery &&
                  filteredContent
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())
                    ? "highlightedMessage"
                    : ""
                }`}
                style={{
                  backgroundColor: isOwnMessage
                    ? selectedConversation.theme || "#0084ff"
                    : "#f0f2f5",
                  borderColor: isOwnMessage
                    ? "transparent"
                    : selectedConversation.theme || "#e2e8f0",
                  color: isOwnMessage ? "#ffffff" : "#1f2937",
                  position: "relative",
                }}
                onMouseLeave={() => setShowMoreOptions(null)}
              >
                <div className="messageOptions">
                  <button
                    className="optionButton"
                    title="Thêm tùy chọn"
                    onClick={() => handleShowMoreOptions(msg.messageId)}
                  >
                    ⋮
                  </button>
                  <button
                    className="optionButton"
                    title="React tin nhắn"
                    onClick={() => handleReact(msg.messageId)}
                  >
                    😊
                  </button>
                  {showMoreOptions === msg.messageId && (
                    <div className="messageMoreOptions">
                      {isOwnMessage && (
                        <>
                          <button
                            className="moreOptionButton"
                            onClick={() => handleRecallMessage(msg.timestamp)}
                          >
                            Thu hồi
                          </button>
                          <button
                            className="moreOptionButton"
                            onClick={() => handleDeleteMessage(msg.timestamp)}
                          >
                            Xóa
                          </button>
                        </>
                      )}
                      <button
                        className="moreOptionButton"
                        onClick={() => handleForwardMessage(msg)}
                      >
                        Chuyển tiếp
                      </button>
                    </div>
                  )}
                  {showReactionModal === msg.messageId && (
                    <div className="reactionModal">
                      <button
                        className="reactionButton"
                        onClick={() => handleSendReaction("👍")}
                      >
                        👍
                      </button>
                      <button
                        className="reactionButton"
                        onClick={() => handleSendReaction("❤️")}
                      >
                        ❤️
                      </button>
                      <button
                        className="reactionButton"
                        onClick={() => handleSendReaction("😢")}
                      >
                        😢
                      </button>
                      <button
                        className="reactionButton"
                        onClick={() => handleSendReaction("😮")}
                      >
                        😮
                      </button>
                      <button
                        className="reactionButton"
                        onClick={() => handleSendReaction("😂")}
                      >
                        😂
                      </button>
                    </div>
                  )}
                </div>
                {msg.status === "deleted" &&
                msg.senderId === currentUser ? (
                  <i className="statusText">Tin nhắn đã bị xóa</i>
                ) : msg.type === "recalled" ? (
                  <i className="statusText">Tin nhắn đã được thu hồi</i>
                ) : msg.type === "system" ? (
                  <span className="systemMessage">{filteredContent}</span>
                ) : (
                  <>
                    <div className="senderName">{senderName}</div>
                    {msg.forwardedFrom && (
                      <div className="forwarded">
                        Chuyển tiếp từ: {msg.forwardedName || msg.forwardedFrom}
                      </div>
                    )}
                    {msg.type === "image" ? (
                      <img
                        src={msg.content}
                        alt="Hình ảnh"
                        className="imagePreview"
                        onError={() => toast.error("Không thể tải hình ảnh")}
                      />
                    ) : msg.type === "audio" ? (
                      <audio controls className="audioPlayer">
                        <source
                          src={msg.content}
                          type={
                            msg.content.endsWith(".mp3")
                              ? "audio/mpeg"
                              : msg.content.endsWith(".wav")
                              ? "audio/wav"
                              : msg.content.endsWith(".webm")
                              ? "audio/webm"
                              : "audio/ogg"
                          }
                        />
                        Trình duyệt của bạn không hỗ trợ thẻ audio.
                      </audio>
                    ) : msg.type === "video" ? (
                      <video controls className="videoPlayer">
                        <source
                          src={msg.content}
                          type={
                            msg.content.endsWith(".mp4")
                              ? "video/mp4"
                              : msg.content.endsWith(".webm")
                              ? "video/webm"
                              : "video/quicktime"
                          }
                        />
                        Trình duyệt của bạn không hỗ trợ thẻ video.
                      </video>
                    ) : msg.type === "file" ? (
                      <a href={msg.content} download className="fileLink">
                        Tệp: {msg.content.split("/").pop()}
                      </a>
                    ) : (
                      <span className="messageContent">{filteredContent}</span>
                    )}
                    {msg.reaction && (
                      <span className="reaction">{msg.reaction}</span>
                    )}
                    <div className="timestamp">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                      {isOwnMessage && isRead && <span className="readReceipt">✓✓</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    })}
  <div ref={messagesEndRef} />
</div>
          <div className="inputArea">
            {showEmojiPicker && (
              <div className="emojiPicker">
                <EmojiPicker onEmojiClick={handleEmojiClick} />
              </div>
            )}
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="emojiButton"
            >
              😊
            </button>
            <label
              className="fileButton"
              title="Chọn file JPG, PNG, GIF, MP3, WAV, OGG, MP4, AVI, MKV, WEBM, MOV (tối đa 50MB)"
            >
              📤
              <input
                type="file"
                onChange={handleFileChange}
                style={{ display: "none" }}
                accept="image/jpeg,image/png,image/gif,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/avi,video/x-matroska,video/webm,video/quicktime"
              />
            </label>
            <button
              onClick={isRecording ? handleStopRecordingAndSend : handleStartRecording}
              className={`voiceButton ${isRecording ? "recording" : ""}`}
              title={isRecording ? "Dừng và gửi ghi âm" : "Ghi âm tin nhắn thoại"}
            >
              {isRecording ? "⏹️" : "🎙️"}
            </button>
            {filePreview && (
              <div className="filePreview">
                {filePreviewType === "image" && (
                  <img src={filePreview} alt="Preview" className="previewImage" />
                )}
                {filePreviewType === "video" && (
                  <video controls className="previewVideo">
                    <source
                      src={filePreview}
                      type={
                        filePreview.endsWith(".mp4")
                          ? "video/mp4"
                          : filePreview.endsWith(".webm")
                          ? "video/webm"
                          : "video/quicktime"
                      }
                    />
                    Trình duyệt của bạn không hỗ trợ thẻ video.
                  </video>
                )}
                <button
                  onClick={() => {
                    setFile(null);
                    setFilePreview(null);
                    setFilePreviewType(null);
                  }}
                  className="removePreviewButton"
                >
                  Xóa
                </button>
              </div>
            )}
            {audioPreviewUrl ? (
              <div className="audioPreviewWrapper">
                <audio controls src={audioPreviewUrl} className="previewAudio" />
                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setAudioPreviewUrl(null);
                  }}
                  className="removePreviewButton"
                >
                  Xóa
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={isRecording ? `Đang ghi âm: ${formatDuration(recordingDuration)}` : newMessage}
                onChange={(e) => !isRecording && setNewMessage(e.target.value)}
                placeholder={isRecording ? "" : "Nhập tin nhắn..."}
                className="input"
                onKeyPress={(e) => !isRecording && e.key === "Enter" && handleSendMessage()}
                disabled={isRecording}
              />
            )}
            {isRecording ? (
              <div className="recordingButtons">
                <button
                  onClick={handleCancelRecording}
                  className="trashButton"
                  title="Hủy ghi âm"
                >
                  🗑️
                </button>
                <button
                  onClick={handleStopRecordingAndSend}
                  className="sendButton"
                >
                  Gửi
                </button>
              </div>
            ) : (
              <button
                onClick={handleSendMessage}
                className="sendButton"
                disabled={!newMessage.trim() && !file && !audioBlob}
              >
                Gửi
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="emptyChat">
          Chọn một cuộc trò chuyện để bắt đầu
        </div>
      )}

      {(callState === "incoming" || callState === "outgoing" || callState === "active") && (
        <div className="callModal">
          <div className="callModalContent">
            <div className="callModalHeader">
              <div
                className="avatar"
                style={{
                  backgroundColor: selectedConversation?.theme || "#3b82f6",
                  width: "80px",
                  height: "80px",
                  fontSize: "32px",
                  margin: "0 auto 15px",
                  border: "3px solid #ffffff",
                  boxShadow: "0 4px rgba(0, 0, 0, 0.2)",
                }}
              >
                {selectedConversation.friendName.charAt(0).toUpperCase()}
              </div>
              <h2 className="modalTitle">
                {callState === "incoming"
                  ? `${selectedConversation.friendName} đang gọi ${callType === "video" ? "video" : "thoại"}`
                  : `Đang gọi ${callType === "video" ? "video" : "thoại"} với ${selectedConversation.friendName}`}
              </h2>
              <p className="callStatus">
                {callState === "incoming"
                  ? "Cuộc gọi đến"
                  : callState === "outgoing"
                  ? "Đang chờ phản hồi..."
                  : `Cuộc gọi đang diễn ra: ${formatDuration(callDuration)}`}
              </p>
            </div>
            {callType === "video" && callState === "active" && (
              <div className="videoContainer">
                <video ref={remoteVideoRef} autoPlay playsInline className="remoteVideo" />
                <video ref={localVideoRef} autoPlay muted playsInline className="localVideo" />
              </div>
            )}
            {callState === "incoming" && (
              <div className="callButtons">
                <button
                  onClick={handleAcceptCall}
                  className="acceptButton"
                  style={{
                    backgroundColor: selectedConversation?.theme || "#22c55e",
                  }}
                >
                  Chấp nhận
                </button>
                <button onClick={handleRejectCall} className="rejectButton">
                  Từ chối
                </button>
              </div>
            )}
            {(callState === "outgoing" || callState === "active") && (
              <button onClick={handleEndCall} className="endCallButton">
                Kết thúc
              </button>
            )}
          </div>
        </div>
      )}

      {showThemeModal && (
        <div className="modal">
          <div className="modalContent">
            <h2>Chọn chủ đề màu sắc</h2>
            <div className="themeOptions">
              {themes.map((theme) => (
                <div key={theme.color} className="themeOption" style={{ display: 'flex', alignItems: 'center', margin: '10px', gap: '10px' }}>
                  <button
                    onClick={() => handleChangeTheme(theme.color)}
                    style={{
                      backgroundColor: theme.color,
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      border: "2px solid #ffffff",
                      cursor: "pointer",
                    }}
                    title={theme.title}
                  />
                  <span style={{ marginLeft: '10px', fontSize: '16px', color: '#1f2937', whiteSpace: 'nowrap' }}>{theme.title}</span>
                </div>
              ))}
            </div>
            <div className="modalButtons">
              <button
                onClick={() => {
                  setShowThemeModal(false);
                  setShowSettingsModal(true);
                }}
                className="modalButton"
                style={{ backgroundColor: '#4CAF50', color: 'white' }}
              >
                Quay lại
              </button>
              <button
                onClick={() => setShowThemeModal(false)}
                className="modalButton"
                style={{ backgroundColor: '#f44336', color: 'white' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {showNicknameModal && (
        <div className="modal">
          <div className="modalContent">
            <h2>Đặt biệt hiệu</h2>
            <div className="nicknameInputContainer">
              <span className="nicknameIcon">✍️</span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nhập biệt hiệu..."
                className="nicknameInput"
              />
            </div>
            <div className="modalButtons">
              <button
                onClick={handleSetNickname}
                className="modalButton"
                style={{ backgroundColor: '#4CAF50', color: 'white' }}
              >
                Lưu
              </button>
              <button
                onClick={() => {
                  setShowNicknameModal(false);
                  setShowSettingsModal(true);
                }}
                className="modalButton"
                style={{ backgroundColor: '#f44336', color: 'white' }}
              >
                Quay lại
              </button>
              <button
                onClick={() => setShowNicknameModal(false)}
                className="modalButton"
                style={{ backgroundColor: '#757575', color: 'white' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="modal">
          <div className="modalContent">
            <h2>Thông tin cá nhân</h2>
            {profile ? (
              <div className="profileInfo">
                <p><strong>Tên:</strong> {profile.name || "Chưa cập nhật"}</p>
                <p><strong>Email:</strong> {profile.email}</p>
                <p><strong>Số điện thoại:</strong> {profile.phoneNumber || "Chưa cung cấp"}</p>
              </div>
            ) : (
              <p>Đang tải thông tin...</p>
            )}
            <div className="modalButtons">
              <button
                onClick={() => {
                  setShowProfileModal(false);
                  setShowSettingsModal(true);
                }}
                className="modalButton"
                style={{ backgroundColor: '#4CAF50', color: 'white', padding: '10px 20px', borderRadius: '5px', marginRight: '10px' }}
              >
                Quay lại
              </button>
              <button
                onClick={() => setShowProfileModal(false)}
                className="modalButton"
                style={{ backgroundColor: '#f44336', color: 'white', padding: '10px 20px', borderRadius: '5px' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal">
          <div className="modalContent">
            <h2 className="modalTitle">Tùy chỉnh đoạn chat</h2>
            <button 
              onClick={() => { setShowSettingsModal(false); setShowThemeModal(true); }}
              className="settingsButton"
            >
              <span className="settingsIcon">🎨</span> Chọn chủ đề
            </button>
            <button 
              onClick={() => { setShowSettingsModal(false); setShowNicknameModal(true); }}
              className="settingsButton"
            >
              <span className="settingsIcon">✍️</span> Đặt biệt hiệu
            </button>
            <button 
              onClick={() => { setShowSettingsModal(false); setShowProfileModal(true); }}
              className="settingsButton"
            >
              <span className="settingsIcon">👤</span> Xem thông tin
            </button>
            <button 
              onClick={handleShowSearchBar}
              className="settingsButton"
            >
              <span className="settingsIcon">🔍</span> Tìm kiếm tin nhắn
            </button>
            <button 
              onClick={handleShowSharedMedia}
              className="settingsButton"
            >
              <span className="settingsIcon">📸</span> Ảnh/Video & Tệp
            </button>
            <button
              onClick={() => setShowSettingsModal(false)}
              className="closeModalButton"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {showSharedMedia && (
        <div className="modal">
          <div className="modalContent">
            <h2>Truyền thông đã chia sẻ</h2>
            <div className="mediaGrid">
              {(() => {
                const mediaByDate = {};
                messages
                  .filter((msg) => ["image", "video"].includes(msg.type))
                  .forEach((msg) => {
                    const date = formatDate(new Date(msg.timestamp));
                    if (!mediaByDate[date]) {
                      mediaByDate[date] = [];
                    }
                    mediaByDate[date].push(msg);
                  });

                return Object.keys(mediaByDate).map((date, index) => (
                  <div key={index}>
                    <div className="dateDivider">{date}</div>
                    <div className="mediaRow">
                      {mediaByDate[date].map((msg, msgIndex) => (
                        <div
                          key={msgIndex}
                          className="mediaItem"
                          onClick={() => handleMediaClick(msg)}
                        >
                          {msg.type === "image" && (
                            <img
                              src={msg.content}
                              alt="Media"
                              className="mediaThumbnail"
                              onError={() => toast.error("Không thể tải hình ảnh")}
                            />
                          )}
                          {msg.type === "video" && (
                            <video
                              src={msg.content}
                              className="mediaThumbnail"
                              muted
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <div className="modalButtons">
              <button
                onClick={() => {
                  setShowSharedMedia(false);
                  setShowSettingsModal(true);
                }}
                className="backModalButton"
              >
                Quay lại
              </button>
              <button
                onClick={() => setShowSharedMedia(false)}
                className="closeModalButton"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaPreview && selectedMedia && (
        <div className="modal">
          <div className="modalContent">
            <h2>Xem truyền thông</h2>
            {selectedMedia.type === "image" && (
              <img
                src={selectedMedia.content}
                alt="Preview"
                className="mediaPreview"
                onError={() => toast.error("Không thể tải hình ảnh")}
              />
            )}
            {selectedMedia.type === "audio" && (
              <audio controls className="mediaPreviewAudio">
                <source
                  src={selectedMedia.content}
                  type={
                    selectedMedia.content.endsWith(".mp3")
                      ? "audio/mpeg"
                      : selectedMedia.content.endsWith(".wav")
                      ? "audio/wav"
                      : selectedMedia.content.endsWith(".webm")
                      ? "audio/webm"
                      : "audio/ogg"
                  }
                />
                Trình duyệt của bạn không hỗ trợ thẻ audio.
              </audio>
            )}
            {selectedMedia.type === "video" && (
              <video controls className="mediaPreviewVideo">
                <source
                  src={selectedMedia.content}
                  type={
                    selectedMedia.content.endsWith(".mp4")
                      ? "video/mp4"
                      : selectedMedia.content.endsWith(".webm")
                      ? "video/webm"
                      : "video/quicktime"
                  }
                />
                Trình duyệt của bạn không hỗ trợ thẻ video.
              </video>
            )}
            <div className="modalButtons">
              <button
                onClick={() => {
                  setShowMediaPreview(false);
                  setSelectedMedia(null);
                  setShowSettingsModal(true);
                }}
                className="backModalButton"
              >
                Quay lại
              </button>
              <button
                onClick={() => {
                  setShowMediaPreview(false);
                  setSelectedMedia(null);
                }}
                className="closeModalButton"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {showForwardModal && (
        <div className="modal">
          <div className="modalContent">
            <h2>Chuyển tiếp tin nhắn</h2>
            <div className="conversationList">
              <p>Chọn cuộc trò chuyện để chuyển tiếp...</p>
              <button
                onClick={() => handleForwardToConversation(selectedConversation)}
              >
                {selectedConversation.friendName}
              </button>
            </div>
            <button
              onClick={() => {
                setShowForwardModal(false);
                setForwardMessage(null);
              }}
              className="closeModalButton"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
export default ChatWindow;