import React from "react";
import pkg from "../../package.json";
const { version } = pkg;

export default function ControlPanel({ className, readerOutput, log, fwVersion, connected }) {
  const hasReaderOutput = Boolean(readerOutput);
  const hasLog = Boolean(log);

  if (connected === false && !hasReaderOutput && !hasLog) {
    return (
      <section className={`panel ${className || ""}`} style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0,overflow:"hidden"}}>
        <div className="lcd-lenel-bar">
          <span className="lcd-lenel-text">Honeywell <strong>LenelS2</strong></span>
          <span className="lcd-lenel-diamond">◆</span>
          <span className="lcd-lenel-text">Red Diamond Reader</span>
        </div>
        <div className="panel-log">
          <div className="lcd-splash">
            <div className="lcd-splash-title lcd-splash-disconnected">⚠ Disconnected</div>
            <div className="lcd-splash-divider">────────────────────────────────</div>
            <div className="lcd-splash-fw">No response from device server.</div>
            <div className="lcd-splash-fw">Check connection and power.</div>
          </div>
        </div>
      </section>
    );
  }

  const splashBody = `Reader Assurance Command Center  v${version}\n` +
    `Teensy Firmware ${fwVersion ? `v${fwVersion}` : "(connecting...)"}\n` +
    `─────────────────────────────────\n` +
    `Ready.`;

  return (
    <section className={`panel ${className || ""}`} style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0,overflow:"hidden"}}>
      <div className="lcd-lenel-bar">
        <span className="lcd-lenel-text">Honeywell <strong>LenelS2</strong></span>
        <span className="lcd-lenel-diamond">◆</span>
        <span className="lcd-lenel-text">Red Diamond Reader</span>
      </div>
      <div className="panel-log">
        {hasReaderOutput || hasLog ? (
          <code>{hasReaderOutput ? readerOutput : log}</code>
        ) : (
          <div className="lcd-splash">
            <div className="lcd-splash-title">Reader Assurance Command Center</div>
            <div className="lcd-splash-version">v{version}</div>
            <div className="lcd-splash-divider">────────────────────────────────</div>
            <div className="lcd-splash-fw">Teensy Firmware {fwVersion ? `v${fwVersion}` : "(connecting...)"}</div>
            <div className="lcd-splash-ready">Ready.</div>
          </div>
        )}
      </div>
    </section>
  );
}
