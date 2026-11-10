import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  createOAuthState, decryptRefreshToken, encryptRefreshToken, googleDriveAuthorizationUrl, verifyOAuthState,
} from "./google-drive.ts";

beforeEach(() => {
  process.env.DRIVE_OAUTH_STATE_SECRET = "test-state-secret-with-at-least-32-bytes";
  process.env.DRIVE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "client-id";
});

describe("Google Drive OAuth security helpers", () => {
  it("signs state and binds it to the current user and nonce", () => {
    const auth = createOAuthState("user-123");
    expect(verifyOAuthState(auth.state, auth.nonce, "user-123")?.sub).toBe("user-123");
    expect(verifyOAuthState(auth.state, auth.nonce, "other-user")).toBeNull();
    expect(verifyOAuthState(auth.state, "wrong-nonce", "user-123")).toBeNull();
    expect(verifyOAuthState(`${auth.state}tampered`, auth.nonce, "user-123")).toBeNull();
  });

  it("encrypts refresh tokens with authenticated encryption", () => {
    const ciphertext = encryptRefreshToken("refresh-token-secret");
    expect(ciphertext).not.toContain("refresh-token-secret");
    expect(decryptRefreshToken(ciphertext)).toBe("refresh-token-secret");
    expect(() => decryptRefreshToken(ciphertext.replace(/.$/, "A"))).toThrow();
  });

  it("requests offline read-only Drive access with PKCE", () => {
    const url = new URL(googleDriveAuthorizationUrl("https://app.test/callback", "signed-state", "challenge"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(url.searchParams.get("scope")).not.toContain("drive");
  });
});
