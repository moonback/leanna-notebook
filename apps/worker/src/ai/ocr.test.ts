import { describe, expect, it, vi } from "vitest";
import { openRouterPdfOcr } from "./ocr.ts";

describe("OpenRouter PDF OCR adapter", () => {
  it("sends a PDF with the selected model and parser engine, then returns the transcription", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "[PAGE 1]\nBonjour le monde." } }],
    }), { status: 200 }));
    const adapter = openRouterPdfOcr({
      apiKey: "test-key", model: "mistral/ocr-model", engine: "mistral-ocr",
    }, request as typeof fetch);
    const result = await adapter.extract(new Uint8Array([37, 80, 68, 70]), 1);
    expect(result).toContain("[PAGE 1]");
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer test-key" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("mistral/ocr-model");
    expect(body.plugins).toEqual([{ id: "file-parser", pdf: { engine: "mistral-ocr" } }]);
    expect(body.messages[0].content[1].file.file_data).toMatch(/^data:application\/pdf;base64,/);
  });

  it("rejects provider configuration errors without retrying", async () => {
    const request = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const adapter = openRouterPdfOcr({ apiKey: "bad", model: "vendor/model", engine: "cloudflare-ai" }, request as typeof fetch);
    await expect(adapter.extract(new Uint8Array([1]), 1)).rejects.toMatchObject({ code: "ocr_provider_rejected" });
  });

  it("rejects oversized PDFs before sending them to OpenRouter", async () => {
    const request = vi.fn();
    const adapter = openRouterPdfOcr({ apiKey: "test", model: "vendor/model", engine: "mistral-ocr" }, request as typeof fetch);
    await expect(adapter.extract(new Uint8Array(40 * 1024 * 1024 + 1), 1)).rejects.toMatchObject({ code: "ocr_file_too_large" });
    expect(request).not.toHaveBeenCalled();
  });

  it("detects a truncated model response", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: "[PAGE 1] Texte incomplet" } }],
    }), { status: 200 }));
    const adapter = openRouterPdfOcr({ apiKey: "test", model: "vendor/model", engine: "mistral-ocr" }, request as typeof fetch);
    await expect(adapter.extract(new Uint8Array([1]), 1)).rejects.toMatchObject({ code: "ocr_output_truncated" });
  });
});
