import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;
const FORBIDDEN_CLIENT_KEY_PATTERN = /(?:service[_-]?role|sb_secret_)/i;

const parseEnvFile = (contents) => Object.fromEntries(
  contents.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      return [];
    }
    return [[match[1], match[2].trim().replace(/^['"]|['"]$/g, '')]];
  })
);

const decodeJwtPayload = (token) => {
  const [, encodedPayload] = token.split('.');
  if (!encodedPayload) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export const classifyBrowserSupabaseConfig = ({ anonKey = '', url = '' } = {}) => {
  const key = String(anonKey).trim();
  const normalizedUrl = String(url).trim();
  const reasonCodes = [];
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalizedUrl)) {
    reasonCodes.push('browser_supabase_url_invalid');
  }
  if (key.length === 0) {
    reasonCodes.push('browser_supabase_key_missing');
  }
  if (FORBIDDEN_CLIENT_KEY_PATTERN.test(key)) {
    reasonCodes.push('browser_supabase_key_forbidden_kind');
  }
  if (key.startsWith('eyJ')) {
    const claims = decodeJwtPayload(key);
    if (claims?.role !== 'anon') {
      reasonCodes.push('browser_supabase_jwt_not_anon');
    }
  } else if (!key.startsWith('sb_publishable_')) {
    reasonCodes.push('browser_supabase_key_not_publishable');
  }
  return {
    configured: key.length > 0 || normalizedUrl.length > 0,
    pass: reasonCodes.length === 0,
    reasonCodes
  };
};

export const inspectBrowserAuthBundle = (bundleText) => {
  const jwtRoles = [...String(bundleText).matchAll(JWT_PATTERN)]
    .map((match) => decodeJwtPayload(match[0])?.role ?? null)
    .filter((role) => role !== null);
  const reasonCodes = [];
  if (FORBIDDEN_CLIENT_KEY_PATTERN.test(bundleText)) {
    reasonCodes.push('browser_bundle_contains_forbidden_supabase_key_marker');
  }
  if (jwtRoles.some((role) => role !== 'anon')) {
    reasonCodes.push('browser_bundle_contains_non_anon_supabase_jwt');
  }
  return {
    pass: reasonCodes.length === 0,
    jwtRoleCount: jwtRoles.length,
    reasonCodes
  };
};

const readArgs = (args) => {
  const options = { envFile: null, requireConfig: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--env-file') {
      options.envFile = args[index + 1] ?? null;
      index += 1;
    } else if (args[index] === '--require-config') {
      options.requireConfig = true;
    } else {
      throw new Error(`unsupported_argument:${args[index]}`);
    }
  }
  return options;
};

export const inspectBrowserAuthSafety = ({ env = process.env, envFile = null, requireConfig = false } = {}) => {
  const fileEnv = envFile ? parseEnvFile(readFileSync(resolve(envFile), 'utf8')) : {};
  const config = classifyBrowserSupabaseConfig({
    anonKey: fileEnv.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY,
    url: fileEnv.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
  });
  const assetDir = resolve(REPO_ROOT, 'dist', 'assets');
  const assetTexts = readdirSync(assetDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(resolve(assetDir, name), 'utf8'));
  const bundle = inspectBrowserAuthBundle(assetTexts.join('\n'));
  const source = readFileSync(resolve(REPO_ROOT, 'src', 'legacy-runtime', 'legacyAuth.ts'), 'utf8');
  const sourceReasonCodes = [];
  if (!source.includes('VITE_SUPABASE_ANON_KEY') || !source.includes('createClient(config.url, config.anonKey')) {
    sourceReasonCodes.push('browser_auth_source_contract_missing');
  }
  if (source.includes('service_role') || source.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    sourceReasonCodes.push('browser_auth_source_contains_service_role');
  }
  const reasonCodes = [
    ...(requireConfig || config.configured ? config.reasonCodes : []),
    ...bundle.reasonCodes,
    ...sourceReasonCodes
  ];
  return {
    pass: reasonCodes.length === 0,
    configChecked: requireConfig || config.configured,
    bundle,
    reasonCodes
  };
};

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const options = readArgs(process.argv.slice(2));
    const result = inspectBrowserAuthSafety(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.pass) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
