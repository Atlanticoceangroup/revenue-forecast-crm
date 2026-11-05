import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FeedbackProvider } from "./components/ui/Feedback";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FeedbackProvider><App /></FeedbackProvider>
  </React.StrictMode>,
);
