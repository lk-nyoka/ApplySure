// Pre-launch checks for the web app. Run after `npm run build`: `npm run preflight`.
// Fails (exit 1) on anything that would leak a secret or ship unfinished; warns on the rest.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const failures = []
const warnings = []
const passes = []

const files = (dir, test = () => true) => !existsSync(join(root, dir)) ? [] :
  readdirSync(join(root, dir), { recursive: true }).map(f => join(root, dir, String(f)))
    .filter(f => statSync(f).isFile() && test(f))
const rel = f => relative(root, f).replaceAll('\\', '/')
const text = f => readFileSync(f, 'utf8')

// 1. Secrets. Anything in the browser bundle or a VITE_ variable is public to every visitor.
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]+/g
const SECRET_PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'a Supabase secret key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bsk_(live|test)_[A-Za-z0-9]{10,}/, 'a payment provider secret key'],
]
function findSecrets(content) {
  const found = SECRET_PATTERNS.filter(([re]) => re.test(content)).map(([, what]) => what)
  for (const [, payload] of content.matchAll(JWT)) {
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (claims.role === 'service_role') found.push('a Supabase service-role key')
    } catch { /* not a token */ }
  }
  return found
}

const bundle = files('dist', f => /\.(js|html|css|json|webmanifest)$/.test(f))
const source = files('src', f => /\.(ts|tsx|css)$/.test(f)).concat(files('public'), [join(root, 'index.html')])
if (!bundle.length) warnings.push('No dist/ folder: run `npm run build` first so the shipped bundle is scanned too.')
let leaks = 0
for (const f of [...bundle, ...source.filter(f => !/\.(png|jpg|svg)$/.test(f))]) {
  for (const what of findSecrets(text(f))) { failures.push(`${rel(f)} contains ${what}. Move that code to the backend and rotate the key.`); leaks++ }
}
for (const f of [join(root, '.env'), join(root, '.env.local'), join(root, '.env.production'), join(root, '.env.example')]) {
  if (!existsSync(f)) continue
  for (const line of text(f).split(/\r?\n/)) {
    const [name, ...rest] = line.split('=')
    if (!name?.startsWith('VITE_')) continue
    if (/SECRET|SERVICE_ROLE|PRIVATE/i.test(name) || findSecrets(rest.join('=')).length) {
      failures.push(`${rel(f)}: ${name} would put a secret in the browser bundle. Keep it on the backend, without the VITE_ prefix.`); leaks++
    }
  }
}
if (!leaks) passes.push('No secret or service-role keys in the bundle, source or VITE_ variables')

// 2. Placeholders and unfinished text that should never reach users.
const PLACEHOLDER = /\b(TODO|FIXME|XXX|REPLACE[_ ]?ME|YOUR_API_KEY|lorem ipsum)\b/i
let placeholders = 0
for (const f of source.filter(f => !/\.(png|jpg)$/.test(f) && !/\.test\.tsx?$/.test(f))) {
  text(f).split(/\r?\n/).forEach((line, i) => {
    if (PLACEHOLDER.test(line)) { failures.push(`${rel(f)}:${i + 1} has placeholder text: ${line.trim().slice(0, 80)}`); placeholders++ }
  })
}
if (!placeholders) passes.push('No TODO, REPLACE or placeholder text in the source')

// 3. Launch files: icon, home-screen install and the pages people look for.
const required = ['public/favicon.svg', 'public/manifest.webmanifest', 'public/icon-192.png', 'public/icon-512.png', 'public/apple-touch-icon.png']
const missing = required.filter(f => !existsSync(join(root, f)))
if (missing.length) failures.push(`Missing launch files: ${missing.join(', ')}`)
else passes.push('Icons and web app manifest are present')

const brand = existsSync(join(root, 'src/lib/brand.ts')) ? text(join(root, 'src/lib/brand.ts')) : ''
const email = brand.match(/SUPPORT_EMAIL\s*=\s*'([^']*)'/)?.[1] ?? ''
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) failures.push('SUPPORT_EMAIL in src/lib/brand.ts is empty or not an email address. The support and privacy pages need a real contact.')
else passes.push(`Support contact is set (${email})`)

const app = existsSync(join(root, 'src/App.tsx')) ? text(join(root, 'src/App.tsx')) : ''
const routes = ['/privacy', '/terms', '/support'].filter(r => !app.includes(`path="${r}"`))
if (routes.length) failures.push(`No route for ${routes.join(', ')}`)
else passes.push('Privacy, terms and support pages are routed')

// Not checkable from here; listed so nobody forgets.
warnings.push('Manual: sign in as two different test users and confirm neither can see the other\'s applications (row-level security).')
warnings.push('Manual: turn the backend off and go offline once, and read every message you see.')

for (const p of passes) console.log(`  ✓ ${p}`)
for (const w of warnings) console.log(`  ! ${w}`)
for (const f of failures) console.log(`  ✗ ${f}`)
console.log(failures.length ? `\nPreflight failed: ${failures.length} problem${failures.length === 1 ? '' : 's'} to fix.` : '\nPreflight passed.')
process.exit(failures.length ? 1 : 0)
