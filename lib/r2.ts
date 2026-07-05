import { AwsClient } from 'aws4fetch';

// Cloudflare R2 via S3-compatible API. Bytes never touch Postgres; the app
// stores only r2_key (files table) and serves short-lived signed GET URLs.
// All four env vars are optional at runtime — see isR2Configured().

function env() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET };
}

export function isR2Configured(): boolean {
  const e = env();
  return Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET);
}

function client(): { aws: AwsClient; base: string } {
  const e = env();
  if (!isR2Configured()) throw new Error('R2 não configurado');
  const aws = new AwsClient({
    accessKeyId: e.R2_ACCESS_KEY_ID!,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  });
  return { aws, base: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${e.R2_BUCKET}` };
}

export async function r2Put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
  const { aws, base } = client();
  const res = await aws.fetch(`${base}/${key}`, {
    method: 'PUT',
    // aws4fetch assina o corpo; BodyInit aceita ArrayBuffer/TypedArray
    body: body as BodyInit,
    headers: { 'Content-Type': contentType },
  });
  if (!res.ok) throw new Error(`falha no upload R2 (${res.status})`);
}

export async function r2SignedGetUrl(key: string, expiresSeconds = 300): Promise<string> {
  const { aws, base } = client();
  const url = new URL(`${base}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  const signed = await aws.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}
