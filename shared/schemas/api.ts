// Zod schemas for REST API validation
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { z } from 'zod';

export const createSessionRequestSchema = z.object({
  hostName: z.string().min(1, 'Host name required').max(50, 'Host name too long'),
});

export const sessionResponseSchema = z.object({
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/, 'Invalid session code format'),
  hostName: z.string(),
  participantCount: z.number().min(1).max(4),
  state: z.enum(['waiting', 'selecting', 'complete', 'expired']),
  expiresAt: z.string().datetime(),
  shareableLink: z.string().url(),
});

export const joinSessionRequestSchema = z.object({
  participantName: z.string().min(1, 'Participant name required').max(50, 'Name too long'),
});

export const joinSessionResponseSchema = z.object({
  participantId: z.string(),
  sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
  participantName: z.string(),
  participantCount: z.number().min(1).max(4),
});

export const dinnerOptionSchema = z.object({
  optionId: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
});

export const dinnerOptionsResponseSchema = z.object({
  options: z.array(dinnerOptionSchema),
});

export const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
});