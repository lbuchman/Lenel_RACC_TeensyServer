import React, { useEffect, useState } from "react";
import "./App.css";
import ActionPanel from "./components/ActionPanel";
import ControlPanel from "./components/ControlPanel";
import LogViewer from "./components/LogViewer";
import ReaderPanel from "./components/ReaderPanel";
import { sendCommand } from "./services/commandsApi";
import {
  extractLogLevel,
  formatHelpOutput,
  formatResponseForHumans,
  normalizeConfig,
} from "./utils/formatters";

const DEFAULT_LOG_LEVEL_OPTIONS = ["trace", "debug", "info", "warn", "error", "fatal"];

function extractLogLevelOptionsFromHelp(payload) {
  const helpData = Array.isArray(payload) ? payload : payload?.help;
  if (!Array.isArray(helpData)) return DEFAULT_LOG_LEVEL_OPTIONS;

  const setLogLevelEntry = helpData.find(
    (item) => String(item?.cmd || "").toLowerCase() === "setloglevel"
  );
  if (!setLogLevelEntry) return DEFAULT_LOG_LEVEL_OPTIONS;

  const rawArgs = String(setLogLevelEntry.arg ?? setLogLevelEntry.args ?? "").toLowerCase();
  if (!rawArgs) return DEFAULT_LOG_LEVEL_OPTIONS;

  const candidates = rawArgs
    .replace(/[<>{}\[\]()]/g, " ")
    .split(/[\s|,/]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !["level", "loglevel", "levels"].includes(token));

  const uniqueCandidates = [...new Set(candidates)];
  const orderedKnown = DEFAULT_LOG_LEVEL_OPTIONS.filter((level) => uniqueCandidates.includes(level));

  return orderedKnown.length > 0 ? orderedKnown : DEFAULT_LOG_LEVEL_OPTIONS;
}

export default function App() {
  const [connected, setConnected] = useState(true);
  const [logLevel, setLogLevel] = useState("info");
  const [logLevelOptions, setLogLevelOptions] = useState(DEFAULT_LOG_LEVEL_OPTIONS);

  const [reader0, setReader0] = useState({ baud: "9600", type: "wiegand" });
  const [reader1, setReader1] = useState({ baud: "9600", type: "wiegand" });
  const [motorDegrees, setMotorDegrees] = useState("90");
  const [commandInput, setCommandInput] = useState("");
  const [controlReaderOutput, setControlReaderOutput] = useState("");
  const [controlLog, setControlLog] = useState("");

  const updateReaders = (config) => {
    const normalized = normalizeConfig(config);

    if (normalized.reader0) {
      setReader0((prev) => ({
        baud: normalized.reader0.baud ?? prev.baud,
        type: normalized.reader0.type ?? prev.type,
      }));
    }

    if (normalized.reader1) {
      setReader1((prev) => ({
        baud: normalized.reader1.baud ?? prev.baud,
        type: normalized.reader1.type ?? prev.type,
      }));
    }

    if (normalized.logLevel) {
      setLogLevel(normalized.logLevel);
    }

  };

  const handleGetConfig = async () => {
    const res = await sendCommand("getconfig");
    setControlLog(formatResponseForHumans(res.data));
    if (res.ok) {
      updateReaders(res.data || {});
      setConnected(true);
    } else {
      setConnected(false);
    }
  };

  const handleGetLogLevel = async () => {
    const res = await sendCommand("getloglevel");
    setControlLog(formatResponseForHumans(res.data));
    if (res.ok) {
      const level = extractLogLevel(res.data);
      if (level) setLogLevel(level);
      setConnected(true);
    } else {
      setConnected(false);
    }
  };

  const handleSetLogLevel = async () => {
    const selectedLevel = String(logLevel || "info").toLowerCase();
    const res = await sendCommand("setloglevel", selectedLevel);
    setControlLog(formatResponseForHumans(res.data));
    if (res.ok) {
      const level = extractLogLevel(res.data);
      if (level) setLogLevel(String(level).toLowerCase());
    }
    setConnected(res.ok);
  };

  const handleSaveEeprom = async () => {
    const res = await sendCommand("saveeeprom");
    setControlLog(formatResponseForHumans(res.data));
    setConnected(res.ok);
  };

  const handleMotorMove = async () => {
    const res = await sendCommand("motormove", motorDegrees);
    setControlLog(formatResponseForHumans(res.data));
    setConnected(res.ok);
  };

  const handleSendCommand = async () => {
    const trimmed = String(commandInput || "").trim();
    if (!trimmed) {
      setControlLog("Please enter a command.");
      return;
    }

    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.length > 0 ? rest.join(" ") : undefined;
    const res = await sendCommand(cmd, arg);
    let output = formatResponseForHumans(res.data);

    if (cmd === "help" && res.ok) {
      const formatted = formatHelpOutput(res.data);
      if (formatted) {
        output = formatted;
      }
      setLogLevelOptions(extractLogLevelOptionsFromHelp(res.data));
    }

    setControlLog(output);
    setControlReaderOutput("");
    setConnected(res.ok);
  };

  const handleRehome = async () => {
    const res = await sendCommand("rehome", undefined, 10000);
    setControlLog(formatResponseForHumans(res.data));
    setConnected(res.ok);
  };

  const handleReboot = async () => {
    const res = await sendCommand("reboot");
    setControlLog(formatResponseForHumans(res.data));
    setConnected(res.ok);
  };

  const handleHelp = async () => {
    const res = await sendCommand("help");
    let output = formatResponseForHumans(res.data);
    if (res.ok) {
      const formatted = formatHelpOutput(res.data);
      if (formatted) {
        output = formatted;
      }
      setLogLevelOptions(extractLogLevelOptionsFromHelp(res.data));
    }
    setControlLog(output);
    setConnected(res.ok);
  };

  useEffect(() => {
    async function loadInitialState() {
      const configRes = await sendCommand("getconfig");
      if (configRes.ok) {
        updateReaders(configRes.data || {});
        setConnected(true);
      } else {
        setConnected(false);
      }

      const logLevelRes = await sendCommand("getloglevel");
      if (logLevelRes.ok) {
        const level = extractLogLevel(logLevelRes.data);
        if (level) setLogLevel(level);
      }

      const helpRes = await sendCommand("help");
      if (helpRes.ok) {
        setLogLevelOptions(extractLogLevelOptionsFromHelp(helpRes.data));
      }
    }

    loadInitialState();
  }, []);

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <p className="eyebrow">READER ASSURANCE COMMAND CENTER</p>
        </div>
        <div className="app-header-controls">
          <button
            className="button-secondary"
            onClick={() => {
              setControlReaderOutput("");
              setControlLog("");
            }}
          >
            Clear
          </button>
          <div className={`status-pill ${connected ? "status-online" : "status-offline"}`}>
            {connected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </header>

      <main className="panel-grid">
        <ReaderPanel
          className="reader-panel"
          readerId={0}
          setConnection={setConnected}
          baud={reader0.baud}
          setBaud={(v) => setReader0({ ...reader0, baud: v })}
          readerMode={reader0.type}
          setReaderMode={(v) => setReader0({ ...reader0, type: v })}
          onReaderOutput={(id, data) => {
            setControlReaderOutput(`Reader ${id}:\n${formatResponseForHumans(data)}`);
          }}
          clearCommandOutput={() => setControlLog("")}
        />

        <ReaderPanel
          className="reader-panel"
          readerId={1}
          setConnection={setConnected}
          baud={reader1.baud}
          setBaud={(v) => setReader1({ ...reader1, baud: v })}
          readerMode={reader1.type}
          setReaderMode={(v) => setReader1({ ...reader1, type: v })}
          onReaderOutput={(id, data) => {
            setControlReaderOutput(`Reader ${id}:\n${formatResponseForHumans(data)}`);
          }}
          clearCommandOutput={() => setControlLog("")}
        />

        <ActionPanel
          onGetConfig={handleGetConfig}
          onSaveEeprom={handleSaveEeprom}
          onRehome={handleRehome}
          onReboot={handleReboot}
          onHelp={handleHelp}
          motorDegrees={motorDegrees}
          setMotorDegrees={setMotorDegrees}
          onMotorMove={handleMotorMove}
          commandInput={commandInput}
          setCommandInput={setCommandInput}
          onSendCommand={handleSendCommand}
        />

        <ControlPanel
          className="panel-control"
          readerOutput={controlReaderOutput}
          log={controlLog}
        />
      </main>

      <LogViewer
        logLevel={logLevel}
        logLevelOptions={logLevelOptions}
        onLogLevelChange={setLogLevel}
        onGetLogLevel={handleGetLogLevel}
        onSetLogLevel={handleSetLogLevel}
        onLogsCleared={(data) => {
          setControlLog(formatResponseForHumans(data));
          setConnected(true);
        }}
      />
    </div>
  );
}
