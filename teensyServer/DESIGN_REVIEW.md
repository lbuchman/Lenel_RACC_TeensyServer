# TeensyServer Design Review (Internal Fixture Context)

Scope and assumptions used for this review:
- Internal test fixture, not production service
- Local network only
- Security hardening is intentionally out of scope
- Unit tests are intentionally out of scope
- React client expects HTTP 200 responses for both success and failure paths

This review focuses on fixture reliability, operability, and API behavior consistency under those constraints.

## Findings (ordered by severity)

### 1. High: clear endpoint handler does not send a response
Reference: [services/commands.service.js](services/commands.service.js#L31), [routes/commands.js](routes/commands.js#L15)

The route handler for GET /commands calls clearLog, but clearLog only writes a file and does not write to res. In Express this can leave the request hanging until timeout.

Impact for fixture use:
- UI hangs or spins when this endpoint is called
- Hard to distinguish success vs stalled backend

Recommended change:
- Make clearLog(req, res) return status 200 with a JSON body such as { success: true }

### 2. High: log stream route can throw if log file does not exist
Reference: [routes/logs.js](routes/logs.js#L48)

The SSE stream always calls fs.watch(logFile, ...). If the log file does not exist yet, this can throw and terminate the request handler.

Impact for fixture use:
- Intermittent startup failures in the React log panel
- First-run behavior is brittle

Recommended change:
- Ensure file exists before watch, or guard fs.watch in try/catch and return an SSE error event while keeping HTTP 200 behavior for normal JSON endpoints

### 3. High: serial init resolves even when open fails
Reference: [teensy/teensy.js](teensy/teensy.js#L117), [teensy/teensySerialLogPort.js](teensy/teensySerialLogPort.js#L26)

Both serial initializers ignore open errors and resolve anyway.

Impact for fixture use:
- Service appears healthy but commands never work
- Failures surface late as timeouts, which is harder to diagnose

Recommended change:
- Keep HTTP 200 contract, but mark an internal connection state and include explicit error payloads in command responses when serial is disconnected

### 4. Medium: command timeout from request body is ignored
Reference: [services/commands.service.js](services/commands.service.js#L23)

sendCommand always uses 10000 ms and ignores incoming timeout.

Impact for fixture use:
- UI timeout controls are misleading
- Some commands may be cut short or wait longer than expected

Recommended change:
- Respect req.body.timeout with sane clamp bounds and fallback default

### 5. Medium: inconsistent error payload style between endpoints
Reference: [services/commands.service.js](services/commands.service.js#L28), [services/program.service.js](services/program.service.js#L60)

One path returns status 200 on error, another returns 500. You clarified that 200 is required for the React app.

Impact for fixture use:
- Frontend behavior diverges between command and program calls

Recommended change:
- Standardize on HTTP 200 and structured payloads, for example:
  - success: { ok: true, data: ... }
  - failure: { ok: false, error: "..." }

### 6. Medium: shell command helper discards command output
Reference: [utils/os.js](utils/os.js#L23), [services/program.service.js](services/program.service.js#L56)

executeShellCommand resolves 0 on success, so caller does not get stdout.

Impact for fixture use:
- Program route cannot return useful CLI output to UI
- Harder to troubleshoot flashing failures

Recommended change:
- Return stdout (and optionally stderr) from helper; preserve current call sites gradually

### 7. Low: duplicate/unclear route mapping for clear behavior
Reference: [index.js](index.js#L19), [routes/commands.js](routes/commands.js#L15)

commands router is mounted on both /commands and /clear. Because clearLog is bound to router root GET, behavior can be confusing and non-obvious.

Impact for fixture use:
- Harder maintenance, accidental endpoint usage

Recommended change:
- Use explicit endpoint names, for example /commands/clear or /logs/clear only

### 8. Low: logger singleton ignores parameters after first call
Reference: [utils/logger.js](utils/logger.js#L15)

Once created, subsequent calls return the same logger regardless of name/path arguments.

Impact for fixture use:
- Logs may go to unintended files if different modules expect different targets

Recommended change:
- If single logger is intentional, remove unused parameters and make that explicit
- If not intentional, create one logger per name/path key

## What is already good for an internal fixture

- Clean overall layering: app -> routes -> services -> hardware adapters
- Straightforward command flow, easy for operators to reason about
- Log tail and stream routes are practical for test bench usage
- Global HTTP 200 behavior is already mostly in place

## Suggested next pass (fixture-focused)

1. Fix hanging response in clearLog and make clear endpoints explicit
2. Make log stream robust when log file is missing at startup
3. Add internal serial connection state and return deterministic error JSON with HTTP 200
4. Respect request timeout for command endpoint
5. Return useful stdout from shell helper for better UI diagnostics

Estimated effort for this scoped pass: about half day to one day.
