// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isR2Configured, r2SignedGetUrl } from '@/lib/r2';

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isR2Configured', () => {
  it('false when any var missing', () => {
    delete process.env.R2_BUCKET;
    expect(isR2Configured()).toBe(false);
  });

  it('true when all vars set', () => {
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';
    expect(isR2Configured()).toBe(true);
  });
});

describe('r2SignedGetUrl', () => {
  it('produces a presigned URL for the bucket/key with expiry', async () => {
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';
    const url = await r2SignedGetUrl('transfer/abc/def.pdf', 300);
    expect(url).toContain('acc.r2.cloudflarestorage.com/bucket/transfer/abc/def.pdf');
    expect(url).toContain('X-Amz-Expires=300');
    expect(url).toContain('X-Amz-Signature=');
  });
});
