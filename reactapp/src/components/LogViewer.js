import React, { useState } from "react";
import {
  FRONTAIL_BASE_URL,
  LOGS_CLEAR_URL,
  LOGS_DOWNLOAD_URL,
  LOGS_TAIL_URL,
} from "../config/endpoints";

const LOG_LEVEL_OPTIONS = ["trace", "debug", "info", "warn", "error", "fatal"];

export default function LogViewer({
  onLogsCleared,
  logLevel,
  logLevelOptions,
  onLogLevelChange,
  onGetLogLevel,
  onSetLogLevel,
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const selectedLevel = String(logLevel || "info").toLowerCase();
  const resolvedOptions = (Array.isArray(logLevelOptions) && logLevelOptions.length > 0
    ? logLevelOptions
    : LOG_LEVEL_OPTIONS
  ).map((level) => String(level).toLowerCase());
  const optionsToRender = resolvedOptions.includes(selectedLevel)
    ? resolvedOptions
    : [...resolvedOptions, selectedLevel];

  const handleDownloadLogs = async () => {
    try {
      let downloadName = "device-logs.log";
      let res = await fetch(LOGS_DOWNLOAD_URL, { cache: "no-store" });

      if (!res.ok) {
        res = await fetch(LOGS_TAIL_URL, { cache: "no-store" });
        downloadName = `device-logs-${new Date().toISOString().replace(/[.:]/g, "-")}.log`;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const contentDisposition = res.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
      if (filenameMatch && filenameMatch[1]) {
        downloadName = decodeURIComponent(filenameMatch[1].replace(/"/g, "").trim());
      }

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.open(LOGS_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
    }
  };

  const handleTrunLogs = async () => {
    try {
      const res = await fetch(LOGS_CLEAR_URL, {
        method: "GET",
        cache: "no-store",
      });
      if (res.ok) {
        const text = await res.text();
        let data;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          data = text;
        }
        setReloadKey((prev) => prev + 1);
        if (typeof onLogsCleared === "function") {
          onLogsCleared(data);
        }
      } else if (typeof onLogsCleared === "function") {
        onLogsCleared(`HTTP ${res.status} ${res.statusText}`);
      }
    } catch (error) {
      if (typeof onLogsCleared === "function") {
        onLogsCleared(`Error clearing logs: ${error.message}`);
      }
    }
  };

  return (
    <section className="log-viewer">
      <div className="log-viewer-header">
        <div className="log-viewer-header-left">
          <div className="log-level-controls">
            <select
              className="log-level-select"
              value={selectedLevel}
              onChange={(e) => {
                if (typeof onLogLevelChange === "function") {
                  onLogLevelChange(e.target.value);
                }
              }}
            >
              {optionsToRender.map((level) => (
                <option key={level} value={level}>
                  {level.toUpperCase()}
                </option>
              ))}
            </select>
            <button className="button-secondary" onClick={onGetLogLevel}>GetLogLevel</button>
            <button className="button-secondary" onClick={onSetLogLevel}>SetLogLevel</button>
          </div>
        </div>
        <div className="log-viewer-actions">
          <div className="log-viewer-actions-left">
            <button className="button-secondary" onClick={() => setReloadKey((prev) => prev + 1)}>
              Clear
            </button>
            <button className="button-secondary" onClick={handleDownloadLogs}>
              Download
            </button>
            <a
              className="button-secondary open-frontail-link"
              href={FRONTAIL_BASE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
          </div>
          <button className="button-secondary button-trunlogs" onClick={handleTrunLogs}>
            Clear Teensy Logs
          </button>
        </div>
      </div>
      <div className="log-content log-content-iframe-wrap">
        <iframe
          key={reloadKey}
          title="Frontail Logs"
          src={FRONTAIL_BASE_URL}
          className="log-viewer-iframe"
        />
      </div>
    </section>
  );
}
