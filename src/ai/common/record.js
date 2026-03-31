const buffer = [];

function normalizeText(payload) {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function record(type, payload) {
  const ts = new Date().toISOString();
  const text = normalizeText(payload);
  buffer.push({ ts, type, payload });
  const line = `[ai:${type}] ${text}`;
  const logger = type === "error" ? console.error : console.log;
  logger(line);
}

function getBuffer() {
  return buffer.slice();
}

module.exports = { record, getBuffer };
