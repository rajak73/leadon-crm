import { describe, it, expect } from 'vitest';
import { runCapture, parseName, parsePhone } from '../src/services/capture.js';
import { validatePassword, slugify } from '@leados/shared';
import { ruleScore, ruleSentiment, ruleCloseProbability, ruleNextBestAction } from '../src/services/ai/heuristics.js';
import { validateEnv } from '../src/lib/validateEnv.js';

describe('password rule (BRD §10.2)', () => {
  it('accepts a strong password', () => {
    expect(validatePassword('LeadOS@123').valid).toBe(true);
  });
  it('rejects weak passwords with reasons', () => {
    const r = validatePassword('weak');
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('slugify', () => {
  it('creates url-safe slugs', () => {
    expect(slugify('Rao Realty!!')).toBe('rao-realty');
  });
});

describe('capture flow (BRD §12)', () => {
  it('scenario 1: no details → NEEDS_NAME_PHONE', () => {
    const r = runCapture({ messageText: 'Hi, I want pricing' });
    expect(r.nextState).toBe('NEEDS_NAME_PHONE');
    expect(r.completed).toBe(false);
  });
  it('scenario 3: name only → NEEDS_PHONE', () => {
    const r = runCapture({ messageText: 'My name is Rahul' });
    expect(r.parsedName).toBe('Rahul');
    expect(r.nextState).toBe('NEEDS_PHONE');
  });
  it('scenario 2: full details → COMPLETE', () => {
    const r = runCapture({ messageText: 'My name is Rahul and my phone is 9876543210' });
    expect(r.parsedName).toBe('Rahul');
    expect(r.parsedPhone).toBe('9876543210');
    expect(r.nextState).toBe('COMPLETE');
    expect(r.completed).toBe(true);
  });
  it('merges previously-known data', () => {
    const r = runCapture({ messageText: 'here is my phone 9876543210', currentName: 'Asha' });
    expect(r.nextState).toBe('COMPLETE');
  });
});

describe('phone/name parsing', () => {
  it('parses a plausible phone', () => {
    expect(parsePhone('call me on 98765 43210')).toBe('9876543210');
  });
  it('ignores too-short numbers', () => {
    expect(parsePhone('order 123')).toBeNull();
  });
  it('parses names from common phrasings', () => {
    expect(parseName('i am Priya')).toBe('Priya');
  });
});

describe('env validation (BRD §19.1)', () => {
  it('passes in the test environment (non-production)', () => {
    // In tests NODE_ENV=test → not production, so validation is lenient.
    const r = validateEnv();
    expect(r).toHaveProperty('ok');
    expect(Array.isArray(r.checks)).toBe(true);
  });
});

describe('AI heuristics (BRD §13.1 fallback)', () => {
  it('scores a lead 0-100 with reasons', () => {
    const r = ruleScore({ phone: '9', email: 'a@b.c', status: 'QUALIFIED', source: 'REFERRAL' });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it('detects sentiment', () => {
    expect(ruleSentiment('thanks, this is great, interested').label).toBe('positive');
    expect(ruleSentiment('this is bad, cancel, refund').label).toBe('negative');
  });
  it('computes close probability from stage', () => {
    expect(ruleCloseProbability({ stageProbability: 80, status: 'OPEN' }).probability).toBeGreaterThan(0);
    expect(ruleCloseProbability({ status: 'WON' }).probability).toBe(100);
  });
  it('recommends next best action', () => {
    const r = ruleNextBestAction({ status: 'NEW', hasPhone: true, captureState: 'COMPLETE' });
    expect(r.action).toBeTruthy();
  });
});
