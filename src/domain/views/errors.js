import { cloneAndFreezeJson } from "../protocol/immutable";

export class ParticipantViewError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ParticipantViewError";
    this.code = code;
    this.details = cloneAndFreezeJson(details);
  }
}

export const participantViewError = (code, message, details) =>
  new ParticipantViewError(code, message, details);
