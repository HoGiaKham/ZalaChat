import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext"; // Thêm ThemeProvider vào đây để toàn bộ ứng dụng sử dụng chế độ sáng/tối
import "./index.css"; // Import các style chung

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <ThemeProvider> {/* Bọc App trong ThemeProvider để có thể sử dụng chế độ sáng/tối */}
      <BrowserRouter> {/* Dùng BrowserRouter để xử lý các route */}
        <App /> {/* Đưa ứng dụng vào Router */}
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
