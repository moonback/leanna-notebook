import * as React from "react";
import { Citation } from "@/components/ui/citation";

export type MdCitation = { marker: number; source_id: string; quote_text: string; char_start: number; char_end: number; verified: boolean; /** Dépôt GitHub : chemin du fichier cité. */ file?: string };

type InlineProps = {
  text: string;
  citations: Map<number, MdCitation>;
  onOpenCitation?: (c: MdCitation) => void;
  sourceTitle?: (id: string) => string | undefined;
};

/** Gras, italique, code inline et pastilles de citation [n], sans dépendance externe. */
function Inline({ text, citations, onOpenCitation, sourceTitle }: InlineProps) {
  const parts = text.split(/(\*\*.+?\*\*|`[^`]+`|\*[^*]+\*|\[\d+\])/g).filter((p) => p !== "");
  return (
    <>
      {parts.map((part, i) => {
        const cite = /^\[(\d+)\]$/.exec(part);
        if (cite) {
          const c = citations.get(Number(cite[1]));
          if (!c) return <span key={i} className="font-mono text-xs text-text-subtle">{part}</span>; // pendant le flux
          return (
            <Citation key={i} n={c.marker} source={`${sourceTitle?.(c.source_id) ?? "Source supprimée"}${c.file ? ` › ${c.file}` : ""}`} quote={c.quote_text}
              verified={c.verified} onOpen={onOpenCitation ? () => onOpenCitation(c) : undefined} />
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i} className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) return <em key={i}>{part.slice(1, -1)}</em>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

type Block =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; text: string }
  | { type: "p"; text: string };

/** Découpe un texte markdown simple en blocs (titres, listes, code, citation en bloc, paragraphes). */
function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); i++; }
      i++; // ligne de fermeture
      blocks.push({ type: "code", lang, code: code.join("\n") });
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length as 2 | 3, text: heading[2] }); i++; continue; }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, "")); i++; }
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push({ type: "ol", items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{2,3})\s/.test(lines[i]) && !lines[i].startsWith("```") && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push({ type: "p", text: para.join("\n") });
  }
  return blocks;
}

/**
 * Rendu markdown minimal pour les réponses du chat : titres, gras/italique/code inline,
 * listes, blocs de code et citations en bloc, plus les pastilles [n] du système de citation.
 * Volontairement sans dépendance : couvre ce que produisent nos prompts, pas le markdown complet.
 */
export function Markdown({ text, citations, onOpenCitation, sourceTitle }: {
  text: string; citations: MdCitation[]; onOpenCitation?: (c: MdCitation) => void; sourceTitle?: (id: string) => string | undefined;
}) {
  const byMarker = React.useMemo(() => new Map(citations.map((c) => [c.marker, c])), [citations]);
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="grid gap-3 font-serif text-reading">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const Tag = b.level === 2 ? "h3" : "h4";
            return <Tag key={i} className={b.level === 2 ? "font-sans text-base font-semibold text-text" : "font-sans text-sm font-semibold text-text"}>
              <Inline text={b.text} citations={byMarker} onOpenCitation={onOpenCitation} sourceTitle={sourceTitle} />
            </Tag>;
          }
          case "ul": return (
            <ul key={i} className="ml-5 grid list-disc gap-1.5">
              {b.items.map((it, j) => <li key={j} className="whitespace-pre-wrap"><Inline text={it} citations={byMarker} onOpenCitation={onOpenCitation} sourceTitle={sourceTitle} /></li>)}
            </ul>
          );
          case "ol": return (
            <ol key={i} className="ml-5 grid list-decimal gap-1.5">
              {b.items.map((it, j) => <li key={j} className="whitespace-pre-wrap"><Inline text={it} citations={byMarker} onOpenCitation={onOpenCitation} sourceTitle={sourceTitle} /></li>)}
            </ol>
          );
          case "code": return (
            <pre key={i} className="overflow-x-auto rounded-lg bg-surface-sunken p-3 font-mono text-xs leading-5 text-text"><code>{b.code}</code></pre>
          );
          case "quote": return (
            <blockquote key={i} className="border-l-2 border-accent pl-3 text-text-muted"><Inline text={b.text} citations={byMarker} onOpenCitation={onOpenCitation} sourceTitle={sourceTitle} /></blockquote>
          );
          case "p": return <p key={i} className="whitespace-pre-wrap"><Inline text={b.text} citations={byMarker} onOpenCitation={onOpenCitation} sourceTitle={sourceTitle} /></p>;
        }
      })}
    </div>
  );
}
