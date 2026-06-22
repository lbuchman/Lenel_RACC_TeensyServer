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
    <section className={`panel ${className || ""}`}>
      <div className="panel-header">
        <h3>Reader {readerId}</h3>
        <span className="badge">{normalizedMode.toUpperCase()}</span>
      </div>

      <div className="panel-row">
        <label>
          Baud Rate
          <select value={baud} onChange={(e) => setBaud(e.target.value)}>
            {baudOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
            {baud && !baudOptions.includes(baud) ? (
              <option key="custom-baud" value={baud}>{`Custom: ${baud}`}</option>
            ) : null}
          </select>
        </label>
        <button className="button-primary" onClick={() => send("setbaudrate", `${readerId} ${baud}`)}>
          Set Baud
        </button>
      </div>

      <div className="panel-row">
        <label>
          Reader Mode
          <select value={normalizedMode} onChange={(e) => setReaderMode(e.target.value)}>
            {modeOptions.map((option) => (
              <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
            ))}
            {normalizedMode && !modeOptions.includes(normalizedMode) ? (
              <option key="custom-mode" value={normalizedMode}>{`Custom: ${normalizedMode}`}</option>
            ) : null}
          </select>
        </label>
        <button className="button-primary" onClick={() => send("setreadertype", `${readerId} ${readerMode}`)}>
          Set Mode
        </button>
      </div>
    </section>
  );
}
