import React from "react";
import { sendCommand } from "../services/commandsApi";

export default function ReaderPanel({
  className,
  readerId,
  setConnection,
  baud,
  setBaud,
  readerMode,
  setReaderMode,
  onReaderOutput,
  clearCommandOutput,
}) {
  const baudOptions = ["9600", "38400", "57600", "115200"];
  const modeOptions = ["wiegand", "osdp"];
  const normalizedMode = readerMode ? String(readerMode).toLowerCase() : "";

  const send = async (cmd, arg) => {
    if (typeof clearCommandOutput === "function") {
      clearCommandOutput();
    }
    if (typeof onReaderOutput === "function") {
      onReaderOutput(readerId, "");
    }
    const res = await sendCommand(cmd, arg);
    setConnection(res.ok);
    if (typeof onReaderOutput === "function") {
      onReaderOutput(readerId, res.data);
    }
  };

  return (
    <section className={`panel reader-instrument ${className || ""}`}>

      {/* Channel header bar */}
      <div className="instr-header">
        <div className="instr-title">READER {readerId}</div>
        {normalizedMode === "osdp" && (
          <div className="instr-lamp instr-lamp-active" title="OSDP" />
        )}
      </div>

      {/* Mode indicator plate */}
      <div className="instr-mode-plate">
        <span className="instr-field-label">Protocol</span>
        <span className="instr-mode-value">{normalizedMode ? normalizedMode.toUpperCase() : "—"}</span>
      </div>

      {/* Baud section */}
      <div className="instr-section">
        <div className="instr-field-label">Baud Rate</div>
        <div className="instr-control-row">
          <select
            className="instr-select"
            value={baud}
            onChange={(e) => setBaud(e.target.value)}
          >
            {baudOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
            {baud && !baudOptions.includes(baud) ? (
              <option key="custom-baud" value={baud}>{`Custom: ${baud}`}</option>
            ) : null}
          </select>
          <button
            className="instr-btn instr-btn-baud"
            onClick={() => send("setbaudrate", `${readerId} ${baud}`)}
          >
            SET
          </button>
        </div>
      </div>

      {/* Mode section */}
      <div className="instr-section">
        <div className="instr-field-label">Reader Mode</div>
        <div className="instr-control-row">
          <select
            className="instr-select"
            value={normalizedMode}
            onChange={(e) => setReaderMode(e.target.value)}
          >
            {modeOptions.map((option) => (
              <option key={option} value={option}>{option.toUpperCase()}</option>
            ))}
            {normalizedMode && !modeOptions.includes(normalizedMode) ? (
              <option key="custom-mode" value={normalizedMode}>{normalizedMode.toUpperCase()}</option>
            ) : null}
          </select>
          <button
            className="instr-btn instr-btn-apply"
            onClick={() => send("setreadertype", `${readerId} ${readerMode}`)}
          >
            SET
          </button>
        </div>
      </div>

    </section>
  );
}
