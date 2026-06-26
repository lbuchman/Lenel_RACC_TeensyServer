import React from "react";

export default function ActionPanel({
  onGetConfig,
  onSaveEeprom,
  onRehome,
  onMotorStop,
  onReboot,
  onHelp,
  motorDegrees,
  setMotorDegrees,
  onMotorMove,
  commandInput,
  setCommandInput,
  onSendCommand,
}) {
  return (
    <section className="panel panel-top">
      <div className="action-buttons-row">
        <button className="button-secondary button-tone-neutral" onClick={onGetConfig}>Get Config</button>
        <button className="button-secondary button-tone-success" onClick={onSaveEeprom}>Save EEPROM</button>
        <button className="button-secondary button-tone-warn" onClick={onRehome}>Rehome</button>
        <button className="button-secondary button-tone-danger" onClick={onMotorStop}>Motor Stop</button>
        <button className="button-secondary button-tone-danger" onClick={onReboot}>Reboot</button>
        <button className="button-secondary button-tone-accent" onClick={onHelp}>Help</button>
      </div>

      <div className="panel-row panel-row-wrap action-row-wrap">
        <div className="action-input-group">
          <label className="action-label action-inline-label">
            Motor Move
          </label>
          <input
            className="motor-input action-input-flex"
            type="number"
            value={motorDegrees}
            onChange={(e) => setMotorDegrees(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onMotorMove();
              }
            }}
            min="0"
            max="360"
            step="1"
          />
        </div>

        <div className="action-command-group">
          <label className="action-label action-inline-label">
            Command
          </label>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSendCommand();
              }
            }}
            placeholder="cmd args"
            className="action-input-flex"
          />
        </div>
      </div>
    </section>
  );
}
