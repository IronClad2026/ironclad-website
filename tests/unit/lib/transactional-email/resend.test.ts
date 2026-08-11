import { beforeEach, describe, expect, it, vi } from "vitest";

const { resendConstructorMock, sendMock } = vi.hoisted(() => ({
  resendConstructorMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class ResendMock {
    emails = { send: sendMock };

    constructor(apiKey: string) {
      resendConstructorMock(apiKey);
    }
  },
}));

import {
  createTransactionalEmailIdempotencyKey,
  sendTransactionalEmail,
} from "@/lib/transactional-email/resend";

const sendInput = {
  apiKey: "re_test_not-a-real-key",
  recipient: "recipient@example.test",
  subject: "Your matchup is ready",
  html: "<p>Your matchup is ready.</p>",
  text: "Your matchup is ready.",
  from: "IronClad Tournaments <notifications@example.test>",
  replyTo: "operations@example.test",
  idempotencyKey: "ic_txn_v1_test-key",
};

describe("transactional email Resend adapter", () => {
  beforeEach(() => {
    resendConstructorMock.mockClear();
    sendMock.mockReset();
  });

  it("derives a stable opaque idempotency key without raw identifiers", () => {
    const input = {
      notificationId: "notification-private-id",
      recipientClerkUserId: "user_private_clerk_id",
      eventKey: "match:private-match-id:activation:2:ready",
      templateKey: "later_round_match_ready" as const,
    };

    const first = createTransactionalEmailIdempotencyKey(input);
    const retry = createTransactionalEmailIdempotencyKey(input);

    expect(retry).toBe(first);
    expect(first).toMatch(/^ic_txn_v1_[A-Za-z0-9_-]{43}$/);
    expect(first.length).toBeLessThanOrEqual(256);
    expect(first).not.toContain(input.notificationId);
    expect(first).not.toContain(input.recipientClerkUserId);
    expect(first).not.toContain(input.eventKey);
    expect(first).not.toContain(input.templateKey);
    expect(JSON.stringify(input)).not.toContain("@");
  });

  it("changes the key when any canonical identity component changes", () => {
    const base = {
      notificationId: "notification-1",
      recipientClerkUserId: "user-1",
      eventKey: "match:1:activation:1:ready",
      templateKey: "division_started_first_match" as const,
    };
    const baseKey = createTransactionalEmailIdempotencyKey(base);

    expect(
      createTransactionalEmailIdempotencyKey({
        ...base,
        notificationId: "notification-2",
      })
    ).not.toBe(baseKey);
    expect(
      createTransactionalEmailIdempotencyKey({
        ...base,
        recipientClerkUserId: "user-2",
      })
    ).not.toBe(baseKey);
    expect(
      createTransactionalEmailIdempotencyKey({
        ...base,
        eventKey: "match:1:activation:2:ready",
      })
    ).not.toBe(baseKey);
    expect(
      createTransactionalEmailIdempotencyKey({
        ...base,
        templateKey: "later_round_match_ready",
      })
    ).not.toBe(baseKey);
  });

  it("constructs the client only when sending and forwards the exact payload", async () => {
    expect(resendConstructorMock).not.toHaveBeenCalled();
    sendMock.mockResolvedValue({
      data: { id: "provider-message-id" },
      error: null,
    });

    await expect(sendTransactionalEmail(sendInput)).resolves.toEqual({
      status: "accepted",
      providerMessageId: "provider-message-id",
    });

    expect(resendConstructorMock).toHaveBeenCalledOnce();
    expect(resendConstructorMock).toHaveBeenCalledWith(sendInput.apiKey);
    expect(sendMock).toHaveBeenCalledWith(
      {
        from: sendInput.from,
        to: sendInput.recipient,
        replyTo: sendInput.replyTo,
        subject: sendInput.subject,
        html: sendInput.html,
        text: sendInput.text,
      },
      { idempotencyKey: sendInput.idempotencyKey }
    );
  });

  it.each([
    ["rate_limit_exceeded", 429, "RESEND_RATE_LIMITED"],
    ["application_error", 500, "RESEND_SERVER_ERROR"],
    ["internal_server_error", 503, "RESEND_SERVER_ERROR"],
  ])(
    "classifies %s provider failures as retryable",
    async (name, statusCode, errorCode) => {
      sendMock.mockResolvedValue({
        data: null,
        error: { name, statusCode, message: "private provider detail" },
      });

      await expect(sendTransactionalEmail(sendInput)).resolves.toEqual({
        status: "retryable_failure",
        errorCode,
      });
    }
  );

  it("classifies network timeouts without returning thrown details", async () => {
    sendMock.mockRejectedValue({
      code: "ETIMEDOUT",
      message: "recipient@example.test timed out after provider request 123",
    });

    await expect(sendTransactionalEmail(sendInput)).resolves.toEqual({
      status: "retryable_failure",
      errorCode: "RESEND_NETWORK_TIMEOUT",
    });
  });

  it("classifies permanent provider request errors as terminal", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        statusCode: 422,
        message: "invalid recipient@example.test",
      },
    });

    await expect(sendTransactionalEmail(sendInput)).resolves.toEqual({
      status: "permanent_failure",
      errorCode: "RESEND_REQUEST_REJECTED",
    });
  });

  it("treats a concurrent same-key request as retryable", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: "concurrent_idempotent_requests",
        statusCode: 409,
        message: "private detail",
      },
    });

    await expect(sendTransactionalEmail(sendInput)).resolves.toEqual({
      status: "retryable_failure",
      errorCode: "RESEND_IDEMPOTENCY_IN_PROGRESS",
    });
  });

  it("treats same-key different-payload reuse as a permanent safety failure", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: "invalid_idempotent_request",
        statusCode: 409,
        message: "private detail",
      },
    });

    await expect(sendTransactionalEmail(sendInput)).resolves.toEqual({
      status: "permanent_failure",
      errorCode: "RESEND_IDEMPOTENCY_MISMATCH",
    });
  });

  it.each([
    null,
    "",
    "x".repeat(256),
    "provider-id\nprivate-detail",
  ])("rejects an invalid accepted provider ID without exposing it", async (id) => {
    sendMock.mockResolvedValue({ data: { id }, error: null });

    await expect(sendTransactionalEmail(sendInput)).resolves.toEqual({
      status: "retryable_failure",
      errorCode: "RESEND_RESPONSE_INVALID",
    });
  });

  it("returns only sanitized bounded failure fields", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const privateDetail =
      "recipient@example.test provider-message-id private-response-body";
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        statusCode: 400,
        message: privateDetail,
        providerResponse: privateDetail,
      },
    });

    const result = await sendTransactionalEmail(sendInput);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(privateDetail);
    expect(serialized).not.toContain(sendInput.recipient);
    expect("errorCode" in result ? result.errorCode.length : 0).toBeLessThanOrEqual(
      64
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});
