import { cloneAndFreezeJson } from "./immutable";

export class DomainProtocolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DomainProtocolError";
    this.code = code;
    this.details = cloneAndFreezeJson(details);
  }
}

export const protocolError = (code, message, details) =>
  new DomainProtocolError(code, message, details);
