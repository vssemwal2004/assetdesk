import { describe, expect, it } from 'vitest';

import { webhookStatusForEvent } from './brevo-webhook.service.js';

describe('Brevo webhook event mapping', () => {
  it.each([
    ['sent', 'ACCEPTED_BY_PROVIDER'],
    ['delivered', 'DELIVERED'],
    ['soft bounce', 'DEFERRED'],
    ['hard_bounce', 'BOUNCED'],
    ['blocked', 'BLOCKED'],
    ['invalid', 'INVALID'],
    ['spam', 'BLOCKED'],
    ['error', 'FAILED'],
  ])('maps %s to %s', (event, status) => {
    expect(webhookStatusForEvent(event)).toBe(status);
  });

  it('ignores non-operational open/click events', () => {
    expect(webhookStatusForEvent('opened')).toBeUndefined();
    expect(webhookStatusForEvent('click')).toBeUndefined();
  });
});
