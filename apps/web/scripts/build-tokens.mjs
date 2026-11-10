// Génère app/tokens.css depuis replica/design/tokens.json (source unique de vérité).
// Usage : pnpm tokens   (relancer après chaque changement de tokens / rebrand)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const t = JSON.parse(readFileSync(here('../../../replica/design/tokens.json'), 'utf8'))
const px = (n) => `${n / 16}rem`
const vars = (obj) => Object.entries(obj).map(([k, v]) => `  --${k}: ${v};`).join('\n')

const out = []
out.push('/* GÉNÉRÉ par scripts/build-tokens.mjs depuis replica/design/tokens.json — ne pas éditer. */')
out.push(`:root {\n  color-scheme: light;\n${vars(t.color)}\n}`)
// sombre : préférence système, sauf choix explicite (data-theme sur <html>)
out.push(`@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n  color-scheme: dark;\n${vars(t['color-dark'])}\n  }\n}`)
out.push(`:root[data-theme="dark"] {\n  color-scheme: dark;\n${vars(t['color-dark'])}\n}`)

// Mapping Tailwind v4 : bg-surface, text-muted, border-input, rounded-md, shadow-pop...
const theme = []
for (const k of Object.keys(t.color)) theme.push(`  --color-${k}: var(--${k});`)
for (const [k, v] of Object.entries(t.font)) theme.push(`  --font-${k}: ${v};`)
for (const [k, v] of Object.entries(t.type)) {
  theme.push(`  --text-${k}: ${px(v.size)};`, `  --text-${k}--line-height: ${px(v.line)};`, `  --text-${k}--font-weight: ${v.weight};`)
  if (v.tracking) theme.push(`  --text-${k}--letter-spacing: ${v.tracking};`)
}
for (const [k, v] of Object.entries(t.radius)) theme.push(`  --radius-${k}: ${v === 999 ? '9999px' : px(v)};`)
for (const [k, v] of Object.entries(t.shadow)) theme.push(`  --shadow-${k}: ${v};`)
for (const [k, v] of Object.entries(t.layout.breakpoints)) theme.push(`  --breakpoint-${k}: ${px(v)};`)
theme.push(`  --ease-out: ${t.motion.ease};`, `  --ease-in: ${t.motion['ease-in']};`)
out.push(`@theme inline {\n${theme.join('\n')}\n}`)

const root = []
for (const [k, v] of Object.entries(t.layout)) if (typeof v === 'number') root.push(`  --${k}: ${px(v)};`)
for (const [k, v] of Object.entries(t.control)) root.push(`  --control-${k}: ${px(v)};`)
for (const [k, v] of Object.entries(t.motion)) root.push(`  --motion-${k}: ${v};`)
for (const [k, v] of Object.entries(t.z)) root.push(`  --z-${k}: ${v};`)
out.push(`:root {\n${root.join('\n')}\n}`)

writeFileSync(here('../app/tokens.css'), out.join('\n\n') + '\n')
console.log(`tokens.css : ${Object.keys(t.color).length} couleurs × 2 thèmes, ${Object.keys(t.type).length} styles de texte`)
