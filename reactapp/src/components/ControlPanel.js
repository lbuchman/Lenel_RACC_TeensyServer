import React from "react";

export default function ControlPanel({ className, readerOutput, log }) {
  return (
    <section className={`panel ${className || ""}`}>
      <div className="panel-log">
        {readerOutput ? <code>{readerOutput}</code> : <code>{log}</code>}
      </div>
    </section>
  );
}
