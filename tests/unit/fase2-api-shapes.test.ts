import { describe, expect, it } from 'vitest';
import { branchUserSchema, featureFlagPatchSchema } from '@/lib/validation';

describe('branchUserSchema', () => {
  it('requires two uuids', () => {
    expect(branchUserSchema.safeParse({ branch_id: 'x', user_id: 'y' }).success).toBe(false);
    expect(
      branchUserSchema.safeParse({
        branch_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '550e8400-e29b-41d4-a716-446655440001',
      }).success
    ).toBe(true);
  });
});

describe('featureFlagPatchSchema', () => {
  it('requires boolean enabled', () => {
    expect(featureFlagPatchSchema.safeParse({ enabled: 'sim' }).success).toBe(false);
    expect(featureFlagPatchSchema.safeParse({ enabled: true }).success).toBe(true);
  });
});
