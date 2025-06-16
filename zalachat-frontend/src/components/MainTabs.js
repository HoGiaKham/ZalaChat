import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import Chats from "./Chats";
import Contacts from "./Contacts";
import Groups from "./Groups"; // Thêm component Groups
import Profile from "./Profile";
import Settings from "./Settings";

function MainTabs({ themes }) { // Nhận themes từ prop
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <Routes>
          <Route path="/chats" element={<Chats themes={themes} />} /> {/* Truyền themes đến Chats */}
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/groups" element={<Groups />} /> {/* Thêm route nhóm */}
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/" element={<Chats themes={themes} />} /> {/* Truyền themes cho route mặc định */}
        </Routes>
      </div>
      <div style={styles.tabNav}>
        <NavLink to="/app/chats" style={styles.navLink} activeStyle={styles.activeNavLink}>
          <div>💬</div>
          Trò chuyện
        </NavLink>
        <NavLink to="/app/contacts" style={styles.navLink} activeStyle={styles.activeNavLink}>
          <div>👥</div>
          Danh bạ
        </NavLink>
        <NavLink to="/app/groups" style={styles.navLink} activeStyle={styles.activeNavLink}>
          <div>👥</div>
          Nhóm
        </NavLink>
        <NavLink to="/app/profile" style={styles.navLink} activeStyle={styles.activeNavLink}>
          <div>👤</div>
          Hồ sơ
        </NavLink>
        <NavLink to="/app/settings" style={styles.navLink} activeStyle={styles.activeNavLink}>
          <div>⚙️</div>
          Cài đặt
        </NavLink>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#f5f5f5",
    width: "100%",
    overflow: "hidden",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    paddingBottom: "60px",
  },
  tabNav: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#fff",
    borderTop: "1px solid #e0e0e0",
    padding: "10px 0",
    minHeight: "60px",
    boxShadow: "0 -2px 5px rgba(0,0,0,0.05)",
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  navLink: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
    color: "#666",
    fontSize: "14px",
    padding: "5px 10px",
    transition: "color 0.2s",
  },
  activeNavLink: {
    color: "#1E90FF",
  },
};

export default MainTabs;