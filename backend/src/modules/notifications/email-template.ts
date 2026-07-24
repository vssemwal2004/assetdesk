import type { EmailTemplateKey } from './email-job.model.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function paragraph(label: string, value: string): string {
  return `<p style="margin:8px 0"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f3ea;color:#28252d;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e5dff0;border-radius:16px;padding:24px"><h1 style="margin:0 0 18px;color:#6336a3;font-size:24px">${escapeHtml(title)}</h1>${body}<p style="margin:24px 0 0;color:#716b78;font-size:13px">AssetDesk · University Server Room</p></div></div></body></html>`;
}

function materialSection(lines: string[]): { html: string; text: string } {
  const safe = lines.length ? lines : ['No material details available'];
  return {
    html: `<h2 style="font-size:17px;color:#6336a3">Materials</h2><ul>${safe.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
    text: `Materials:\n${safe.map((line) => `- ${line}`).join('\n')}`,
  };
}

function renderIssued(params: Record<string, unknown>, receiverCopy: boolean): RenderedEmail {
  const issueId = text(params.issueId);
  const receiverName = text(params.receiverName);
  const issuedBy = text(params.issuedBy);
  const issuedAt = text(params.issuedAt);
  const expectedReturnAt = text(params.expectedReturnAt, 'No return expected');
  const viewUrl = text(params.viewUrl);
  const billUrl = text(params.billUrl);
  const materials = materialSection(stringList(params.materials));
  const title = `Material issued · ${issueId}`;
  const greeting = receiverCopy ? `Hello ${receiverName},` : 'Issue Record created.';
  const body = `<p>${escapeHtml(greeting)}</p>${paragraph('Issue ID', issueId)}${paragraph('Receiver', receiverName)}${paragraph('Issued by', issuedBy)}${paragraph('Issue time (IST)', issuedAt)}${paragraph('Expected Return (IST)', expectedReturnAt)}${materials.html}${viewUrl ? `<p><a href="${escapeHtml(viewUrl)}" style="color:#6336a3;font-weight:bold">View Issue Record</a></p>` : ''}${billUrl ? `<p><a href="${escapeHtml(billUrl)}" style="color:#6336a3;font-weight:bold">Open Issue Receipt</a></p>` : ''}<p>Please contact the university server room if any detail is incorrect.</p>`;
  return {
    subject: `[AssetDesk] Material issued · ${issueId}`,
    html: layout(title, body),
    text: `${greeting}\n\nIssue ID: ${issueId}\nReceiver: ${receiverName}\nIssued by: ${issuedBy}\nIssue time (IST): ${issuedAt}\nExpected Return (IST): ${expectedReturnAt}\n\n${materials.text}${viewUrl ? `\n\nView Issue Record: ${viewUrl}` : ''}${billUrl ? `\nIssue Receipt: ${billUrl}` : ''}\n\nPlease contact the university server room if any detail is incorrect.`,
  };
}

function renderReturned(params: Record<string, unknown>, receiverCopy: boolean): RenderedEmail {
  const issueId = text(params.issueId);
  const receiverName = text(params.receiverName);
  const returnedBy = text(params.returnedBy);
  const returnedAt = text(params.returnedAt);
  const remaining = text(params.remainingOutstanding, '0');
  const viewUrl = text(params.viewUrl);
  const billUrl = text(params.billUrl);
  const materials = materialSection(stringList(params.materials));
  const title = `Material Return recorded · ${issueId}`;
  const greeting = receiverCopy ? `Hello ${receiverName},` : 'A Return was recorded.';
  const body = `<p>${escapeHtml(greeting)}</p>${paragraph('Issue ID', issueId)}${paragraph('Recorded by', returnedBy)}${paragraph('Return time (IST)', returnedAt)}${paragraph('Items still outstanding', remaining)}${materials.html}${viewUrl ? `<p><a href="${escapeHtml(viewUrl)}" style="color:#6336a3;font-weight:bold">View Issue Record</a></p>` : ''}${billUrl ? `<p><a href="${escapeHtml(billUrl)}" style="color:#6336a3;font-weight:bold">Open Return Receipt</a></p>` : ''}<p>This message confirms the digital Return record.</p>`;
  return {
    subject: `[AssetDesk] Material Return recorded · ${issueId}`,
    html: layout(title, body),
    text: `${greeting}\n\nIssue ID: ${issueId}\nRecorded by: ${returnedBy}\nReturn time (IST): ${returnedAt}\nItems still outstanding: ${remaining}\n\n${materials.text}${viewUrl ? `\n\nView Issue Record: ${viewUrl}` : ''}${billUrl ? `\nReturn Receipt: ${billUrl}` : ''}\n\nThis message confirms the digital Return record.`,
  };
}

function renderInvitation(params: Record<string, unknown>): RenderedEmail {
  const name = text(params.name);
  const workerId = text(params.workerId);
  const temporaryPassword = text(params.temporaryPassword);
  const expiresAt = text(params.expiresAt);
  const loginUrl = text(params.loginUrl);
  const body = `<p>Hello ${escapeHtml(name)},</p><p>Your AssetDesk Worker account is ready.</p>${paragraph('Worker ID', workerId)}${paragraph('Temporary password', temporaryPassword)}${paragraph('Credential expiry (IST)', expiresAt)}<p>This password is temporary. You must create a new password at first login. An administrator will never ask you to disclose your password.</p><p><a href="${escapeHtml(loginUrl)}" style="color:#6336a3;font-weight:bold">Open AssetDesk</a></p>`;
  return {
    subject: '[AssetDesk] Your Worker account',
    html: layout('Welcome to AssetDesk', body),
    text: `Hello ${name},\n\nYour AssetDesk Worker account is ready.\nWorker ID: ${workerId}\nTemporary password: ${temporaryPassword}\nCredential expiry (IST): ${expiresAt}\n\nThis password is temporary. You must create a new password at first login. An administrator will never ask you to disclose your password.\n\nOpen AssetDesk: ${loginUrl}`,
  };
}

function renderPasswordChanged(params: Record<string, unknown>): RenderedEmail {
  const name = text(params.name);
  const workerId = text(params.workerId);
  const changedAt = text(params.changedAt);
  const body = `<p>Hello ${escapeHtml(name)},</p><p>Your AssetDesk password was changed.</p>${paragraph('Account', workerId)}${paragraph('Change time (IST)', changedAt)}<p>If you did not make this change, contact the university server-room administrator immediately.</p>`;
  return {
    subject: '[AssetDesk] Password changed',
    html: layout('Password changed', body),
    text: `Hello ${name},\n\nYour AssetDesk password was changed.\nAccount: ${workerId}\nChange time (IST): ${changedAt}\n\nIf you did not make this change, contact the university server-room administrator immediately.`,
  };
}

function renderReminder(params: Record<string, unknown>, receiverCopy: boolean): RenderedEmail {
  const issueId = text(params.issueId);
  const receiverName = text(params.receiverName);
  const expectedReturnAt = text(params.expectedReturnAt);
  const overdueDuration = text(params.overdueDuration);
  const viewUrl = text(params.viewUrl);
  const materials = materialSection(stringList(params.materials));
  const greeting = receiverCopy
    ? `Hello ${receiverName},`
    : `A Return reminder was sent to ${receiverName}.`;
  const body = `<p>${escapeHtml(greeting)}</p><p>This is a reminder that university material is awaiting Return to the server room.</p>${paragraph('Issue ID', issueId)}${paragraph('Expected Return (IST)', expectedReturnAt)}${paragraph('Overdue by', overdueDuration)}${materials.html}${viewUrl ? `<p><a href="${escapeHtml(viewUrl)}" style="color:#6336a3;font-weight:bold">View Issue Record</a></p>` : ''}<p>Please contact the university server room if the material has already been returned.</p>`;
  return {
    subject: `[AssetDesk] Return reminder · ${issueId}`,
    html: layout(`Material Return reminder · ${issueId}`, body),
    text: `${greeting}\n\nUniversity material is awaiting Return to the server room.\nIssue ID: ${issueId}\nExpected Return (IST): ${expectedReturnAt}\nOverdue by: ${overdueDuration}\n\n${materials.text}${viewUrl ? `\n\nView Issue Record: ${viewUrl}` : ''}\n\nPlease contact the university server room if the material has already been returned.`,
  };
}

export function renderEmail(
  templateKey: EmailTemplateKey,
  params: Record<string, unknown>,
): RenderedEmail {
  switch (templateKey) {
    case 'WORKER_INVITATION':
      return renderInvitation(params);
    case 'MATERIAL_ISSUED_RECEIVER':
      return renderIssued(params, true);
    case 'MATERIAL_ISSUED_OPERATOR':
      return renderIssued(params, false);
    case 'MATERIAL_RETURNED_RECEIVER':
      return renderReturned(params, true);
    case 'MATERIAL_RETURNED_OPERATOR':
      return renderReturned(params, false);
    case 'PASSWORD_CHANGED':
      return renderPasswordChanged(params);
    case 'RETURN_REMINDER_RECEIVER':
      return renderReminder(params, true);
    case 'RETURN_REMINDER_OPERATOR':
      return renderReminder(params, false);
  }
}
