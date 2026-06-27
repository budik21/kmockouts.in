/**
 * Dev-only: render the "Play-off Pick'em is LIVE" campaign e-mail to a static
 * HTML file so it can be previewed in the browser without admin auth.
 * Run: npx tsx scripts/preview-playoff-open.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildPlayoffOpenEmail } from '../src/lib/email-templates/playoff-open';

const { html } = buildPlayoffOpenEmail({ userName: 'Radek' });
const outDir = join(process.cwd(), 'public');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'playoff-open-preview.html');
writeFileSync(out, html, 'utf8');
console.log(`Wrote ${out}`);
