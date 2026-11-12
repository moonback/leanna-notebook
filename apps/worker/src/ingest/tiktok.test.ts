import { describe, expect, it } from "vitest";
import { parseTikTokVideoData } from "./extract.ts";

describe("parseTikTokVideoData", () => {
  it("extrait l'URL média et le titre d'une vidéo publique", () => {
    const payload = {
      __DEFAULT_SCOPE__: {
        "webapp.video-detail": {
          itemInfo: {
            itemStruct: {
              desc: "Présentation du sujet",
              author: { uniqueId: "createur" },
              video: { playAddr: "https://v16.example-cdn.com/video.mp4" },
            },
          },
        },
      },
    };
    const html = `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(payload)}</script></html>`;
    expect(parseTikTokVideoData(html)).toEqual({
      playAddr: "https://v16.example-cdn.com/video.mp4",
      title: "TikTok @createur — Présentation du sujet",
    });
  });

  it("refuse une page sans données vidéo publiques", () => {
    expect(() => parseTikTokVideoData("<html></html>")).toThrow("tiktok_unavailable");
  });
});
