import { COMMANDS_API_URL } from "../config/endpoints";

export async function sendCommand(cmd, arg, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(COMMANDS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(arg ? { cmd, arg } : { cmd }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      data = text;
    }

    if (!res.ok) {
      const errorString = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return {
        ok: false,
        data: `HTTP ${res.status} ${res.statusText}${errorString ? `: ${errorString}` : ""}`,
      };
    }

    return { ok: true, data };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, data: err.name === "AbortError" ? "Timeout" : err.message };
  }
}
