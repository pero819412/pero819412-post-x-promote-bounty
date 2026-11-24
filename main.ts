// Entry program for make.fun's post-x-promote-make-your-own-bounty-01 bounty (Node 22, standard library only).
//
// It validates POST.json at the repository root and copies it, byte for byte, to the output directory:
//   - source:  $MAKEFUN_BOT_DIR/POST.json if MAKEFUN_BOT_DIR is set, otherwise POST.json beside this file
//              (the repository root, which the grader mounts at /bot)
//   - target:  $MAKEFUN_OUTPUT_DIR/POST.json, falling back to /output/POST.json; the directory is created if needed
// No network, no clock, nothing read outside the repository: two runs write identical bytes.
// On a missing or invalid POST.json it prints a clear error and exits with status 1; on success it prints nothing.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MAX_POST_FILE_BYTES = 16384;

// https://x.com/<handle>/status/<id>, the same on twitter.com, optionally www./mobile., or /i/web/status/<id>;
// the id is digits only, and a query or fragment after it is allowed.
const POST_URL_PATTERN =
  /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status\/[0-9]+(?:[?#].*)?$/;

// Called only after POST_URL_PATTERN has rejected a url (the pattern alone decides validity): names the first part
// of the address that is wrong, so the person fixing POST.json knows exactly what to change.
function explainUrlRejection(url: string): string {
  if (url !== url.trim()) return 'it has leading or trailing whitespace';
  if (!url.startsWith('https://')) return 'it must start with https://';

  const afterScheme = url.slice('https://'.length);
  const queryStart = afterScheme.search(/[?#]/);
  const hostAndPath = queryStart === -1 ? afterScheme : afterScheme.slice(0, queryStart);
  const slash = hostAndPath.indexOf('/');
  const host = slash === -1 ? hostAndPath : hostAndPath.slice(0, slash);
  const path = slash === -1 ? '' : hostAndPath.slice(slash);

  if (!/^(?:www\.|mobile\.)?(?:x|twitter)\.com$/.test(host)) {
    return `host "${host}" is not x.com or twitter.com (www. or mobile. before either is allowed)`;
  }

  const parts = /^\/(i\/web|[^/]+)\/status\/([^/]*)(\/.*)?$/.exec(path);
  if (parts === null) {
    return `path "${path === '' ? '/' : path}" is not /<handle>/status/<id> or /i/web/status/<id>`;
  }
  const [, account, id, extra] = parts;
  if (account !== 'i/web' && !/^[A-Za-z0-9_]{1,15}$/.test(account)) {
    return `handle "${account}" is not a valid X handle (1 to 15 letters, digits or underscores)`;
  }
  if (id === '') return 'the status id after /status/ is missing';
  if (!/^[0-9]+$/.test(id)) return `status id "${id}" is not digits only`;
  if (extra !== undefined) return `it has extra path "${extra}" after the status id; remove it`;
  return 'it does not have the shape https://x.com/<handle>/status/<id>';
}

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function repositoryRoot(): string {
  const fromEnv = process.env.MAKEFUN_BOT_DIR;
  if (fromEnv !== undefined && fromEnv !== '') return resolve(fromEnv);
  return import.meta.dirname;
}

function outputDirectory(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  return fromEnv !== undefined && fromEnv !== '' ? resolve(fromEnv) : '/output';
}

function readPostFile(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') fail(`POST.json not found at ${path}`);
    fail(`POST.json could not be read at ${path}: ${(err as Error).message}`);
  }
}

function validatePostFile(bytes: Buffer, path: string): void {
  if (bytes.length > MAX_POST_FILE_BYTES) {
    fail(`POST.json at ${path} is ${bytes.length} bytes; the limit is ${MAX_POST_FILE_BYTES}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    fail(`POST.json at ${path} is not valid JSON: ${(err as Error).message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`POST.json at ${path} must be a JSON object like {"url": "https://x.com/<handle>/status/<id>"}`);
  }

  const url = (parsed as Record<string, unknown>).url;
  if (typeof url !== 'string') {
    fail(`POST.json at ${path} has no string "url" field`);
  }
  if (!POST_URL_PATTERN.test(url)) {
    fail(
      `POST.json "url" ${JSON.stringify(url)} is not an X post address ` +
        `(https://x.com/<handle>/status/<id>): ${explainUrlRejection(url)}`,
    );
  }
}

function main(): void {
  const source = join(repositoryRoot(), 'POST.json');
  const bytes = readPostFile(source);
  validatePostFile(bytes, source);

  const outDir = outputDirectory();
  const target = join(outDir, 'POST.json');
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(target, bytes);
  } catch (err) {
    fail(`could not write ${target}: ${(err as Error).message}`);
  }
}

main();
