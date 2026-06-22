function extractConfigPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.config && typeof payload.config === "object") return extractConfigPayload(payload.config);
  if (payload.data && typeof payload.data === "object") return extractConfigPayload(payload.data);
  if (payload.payload && typeof payload.payload === "object") return extractConfigPayload(payload.payload);
  return payload;
}

function normalizeReaderConfig(reader) {
  if (!reader || typeof reader !== "object") return null;
  const baud = reader.baud ?? reader.baudrate ?? reader.baud_rate ?? reader.speed ?? reader.rate;
  const type = reader.type ?? reader.readerType ?? reader.readertype ?? reader.mode ?? reader.format;

  return {
    baud: baud != null ? String(baud) : undefined,
    type: type != null ? String(type).toLowerCase() : undefined,
  };
}

export function normalizeConfig(payload) {
  const config = extractConfigPayload(payload) || {};

  const reader0 = normalizeReaderConfig(
    config.reader0 ?? config["reader-0"] ?? config.reader_0 ?? (config.readers && config.readers[0]) ?? {
      baud: config.osdpReader1BaudRate ?? config.reader1BaudRate ?? config.reader1_baud_rate,
      type: config.reader1Type ?? config.reader1type ?? config.reader1_type,
    }
  );

  const reader1 = normalizeReaderConfig(
    config.reader1 ?? config["reader-1"] ?? config.reader_1 ?? (config.readers && config.readers[1]) ?? {
      baud: config.osdpReader2BaudRate ?? config.reader2BaudRate ?? config.reader2_baud_rate,
      type: config.reader2Type ?? config.reader2type ?? config.reader2_type,
    }
  );

  const logLevel = config.logLevel ?? config.log_level ?? config.loglevel;

  return {
    reader0,
    reader1,
    logLevel: logLevel != null ? String(logLevel) : undefined,
  };
}

export function extractLogLevel(payload) {
  if (payload == null) return undefined;
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    return (
      payload.logLevel ?? payload.log_level ?? payload.loglevel ?? payload.level ?? payload.data ?? undefined
    );
  }
  return String(payload);
}

export function formatHelpOutput(response) {
  const helpData = Array.isArray(response) ? response : response?.help;
  if (!Array.isArray(helpData)) return null;

  return helpData
    .map((item) => {
      const itemArg = item.arg ?? item.args ?? "";
      const description = item.desc ?? item.description ?? "";
      const commandLine = itemArg ? `${item.cmd} ${itemArg}` : item.cmd;
      return description ? `${commandLine} - ${description}` : commandLine;
    })
    .join("\n");
}

function humanizeKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatPrimitive(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function tryParseJsonString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksLikeJson) return value;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
}

export function formatResponseForHumans(value, indent = 0) {
  const parsedValue = tryParseJsonString(value);
  const pad = "  ".repeat(indent);

  if (parsedValue === null || parsedValue === undefined) {
    return `${pad}${formatPrimitive(parsedValue)}`;
  }

  if (Array.isArray(parsedValue)) {
    if (parsedValue.length === 0) return `${pad}(empty list)`;
    return parsedValue
      .map((item, index) => {
        if (item && typeof item === "object") {
          return `${pad}${index + 1})\n${formatResponseForHumans(item, indent + 1)}`;
        }
        return `${pad}${index + 1}) ${formatPrimitive(item)}`;
      })
      .join("\n");
  }

  if (typeof parsedValue === "object") {
    const entries = Object.entries(parsedValue);
    if (entries.length === 0) return `${pad}(empty object)`;

    return entries
      .map(([key, item]) => {
        const label = humanizeKey(key);
        if (item && typeof item === "object") {
          return `${pad}${label}:\n${formatResponseForHumans(item, indent + 1)}`;
        }
        return `${pad}${label}: ${formatPrimitive(item)}`;
      })
      .join("\n");
  }

  return `${pad}${formatPrimitive(parsedValue)}`;
}
