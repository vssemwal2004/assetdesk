import { describe, expect, it } from 'vitest';

import { renderEmail } from './email-template.js';

describe('email templates', () => {
  it('renders both HTML and plain text Issue evidence', () => {
    const result = renderEmail('MATERIAL_ISSUED_RECEIVER', {
      issueId: 'GEU-ISS-2026-000001',
      receiverName: 'Aarav Sharma',
      issuedBy: 'Server Room Admin (GEU-ADM-001)',
      issuedAt: '16 Jul 2026, 10:30 am',
      expectedReturnAt: '17 Jul 2026, 10:30 am',
      materials: ['Laptop (GEU-MAT-000001) — GEU-AST-000001'],
    });

    expect(result.subject).toContain('GEU-ISS-2026-000001');
    expect(result.html).toContain('Aarav Sharma');
    expect(result.text).toContain('Laptop (GEU-MAT-000001)');
    expect(result.text).not.toMatch(/price|payment|invoice/i);
  });

  it('escapes user-controlled values in HTML while retaining readable plain text', () => {
    const result = renderEmail('MATERIAL_RETURNED_RECEIVER', {
      issueId: 'GEU-ISS-2026-000001',
      receiverName: '<img src=x onerror=alert(1)>',
      returnedBy: 'Worker & Admin',
      returnedAt: '16 Jul 2026, 11:00 am',
      remainingOutstanding: '0',
      materials: ['Cable <script>alert(1)</script> — 1 returned'],
    });

    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img src=x');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.text).toContain('<script>alert(1)</script>');
  });

  it('includes first-login security instructions in invitations', () => {
    const result = renderEmail('WORKER_INVITATION', {
      name: 'Worker One',
      workerId: 'GEU-AB12',
      temporaryPassword: 'a-long-temporary-password',
      expiresAt: '17 Jul 2026, 10:00 am',
      loginUrl: 'https://assetdesk.example.edu/login',
    });

    expect(result.text).toContain('must create a new password');
    expect(result.text).toContain('will never ask you');
    expect(result.html).toContain('https://assetdesk.example.edu/login');
  });

  it('renders a safe Return reminder with overdue and outstanding-material evidence', () => {
    const result = renderEmail('RETURN_REMINDER_RECEIVER', {
      issueId: 'GEU-ISS-2026-000001',
      receiverName: 'Aarav <script>alert(1)</script>',
      expectedReturnAt: '15 Jul 2026, 10:30 am',
      overdueDuration: '1 day',
      materials: ['Network Switch <img src=x onerror=alert(1)> — 1 unit outstanding'],
      viewUrl: 'https://assetdesk.example.edu/issues/GEU-ISS-2026-000001',
    });

    expect(result.subject).toBe('[AssetDesk] Return reminder · GEU-ISS-2026-000001');
    expect(result.text).toContain('Overdue by: 1 day');
    expect(result.text).toContain('1 unit outstanding');
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img src=x');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.text).not.toMatch(/price|payment|invoice/i);
  });
});
