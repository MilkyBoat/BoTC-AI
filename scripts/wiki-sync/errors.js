class WikiSyncError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WikiSyncError";
    this.code = code;
    this.details = details;
  }
}

const asWikiSyncError = (error, fallbackCode = "unexpected-error") => {
  if (error instanceof WikiSyncError) return error;
  return new WikiSyncError(fallbackCode, error.message || String(error), {
    cause: error.name || "Error",
  });
};

module.exports = { WikiSyncError, asWikiSyncError };
