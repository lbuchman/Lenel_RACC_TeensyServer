const isProduction = process.env.NODE_ENV === "production";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function buildProductionBaseUrl(port) {
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

function resolveBaseUrl(devEnvValue, productionPort) {
  if (!isProduction) {
    const configuredValue = trimTrailingSlash(devEnvValue);
    if (configuredValue) {
      return configuredValue;
    }
  }

  return buildProductionBaseUrl(productionPort);
}

export const REST_API_BASE_URL = resolveBaseUrl(process.env.REACT_APP_REST_API_BASE_URL, 3300);
export const LOG_API_BASE_URL = resolveBaseUrl(process.env.REACT_APP_LOG_API_BASE_URL, 3300);
export const FRONTAIL_BASE_URL = resolveBaseUrl(process.env.REACT_APP_FRONTAIL_BASE_URL, 8080);

export const COMMANDS_API_URL = `${REST_API_BASE_URL}/commands`;
export const LOGS_DOWNLOAD_URL = `${LOG_API_BASE_URL}/logs/download`;
export const LOGS_TAIL_URL = `${LOG_API_BASE_URL}/logs/tail`;
export const LOGS_CLEAR_URL = `${LOG_API_BASE_URL}/clear`;