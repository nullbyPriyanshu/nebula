export class AuthExpiredError extends Error {
  constructor(public email: string) {
    super(`Login expired for ${email}. Reconnect it to continue.`);
    this.name = "AuthExpiredError";
  }
}

export class DriveError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export class QuotaExceededError extends DriveError {
  constructor(public email: string) {
    super(403, "storageQuotaExceeded", `${email} is full.`);
    this.name = "QuotaExceededError";
  }
}

export class IntegrityError extends Error {
  constructor(name: string) {
    super(`"${name}" came back damaged, try again.`);
    this.name = "IntegrityError";
  }
}

const POPUP_MESSAGES: Record<string, string> = {
  popup_closed: "The Google sign-in window was closed before finishing.",
  popup_failed_to_open:
    "The Google sign-in popup was blocked. Allow popups for Nebula and try again.",
  access_denied: "Access was not granted, so the account was not connected.",
};

export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return POPUP_MESSAGES[error.message] ?? error.message;
  }

  return String(error);
}
