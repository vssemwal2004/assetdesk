import {
  AuthResponseSchema,
  MeResponseSchema,
  type AuthUser,
  type ChangeInitialPasswordRequest,
  type ChangePasswordRequest,
  type LoginRequest,
} from '@assetdesk/contracts';

import { apiRequest, setCsrfToken } from './api-client';

function acceptAuthResponse(payload: unknown): AuthUser {
  const result = AuthResponseSchema.parse(payload);
  setCsrfToken(result.data.csrfToken);
  return result.data.user;
}

export async function login(input: LoginRequest): Promise<AuthUser> {
  const payload = await apiRequest<unknown>('/api/v1/auth/login', {
    method: 'POST',
    json: input,
    retryOnUnauthorized: false,
  });
  return acceptAuthResponse(payload);
}

export async function getCurrentUser(): Promise<AuthUser> {
  const payload = await apiRequest<unknown>('/api/v1/auth/me');
  return MeResponseSchema.parse(payload).data.user;
}

export async function changeInitialPassword(
  input: ChangeInitialPasswordRequest,
): Promise<AuthUser> {
  const payload = await apiRequest<unknown>('/api/v1/auth/change-initial-password', {
    method: 'POST',
    json: input,
  });
  return acceptAuthResponse(payload);
}

export async function changePassword(input: ChangePasswordRequest): Promise<AuthUser> {
  const payload = await apiRequest<unknown>('/api/v1/auth/change-password', {
    method: 'POST',
    json: input,
  });
  return acceptAuthResponse(payload);
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/api/v1/auth/logout', { method: 'POST' });
  } finally {
    setCsrfToken(null);
  }
}
