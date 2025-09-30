// REST API endpoints for session management
// Based on: specs/001-dinner-decider-enables/contracts/openapi.yaml

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as SessionService from '../services/SessionService.js';

const router = Router();

// Zod schemas for validation
const createSessionRequestSchema = z.object({
  hostName: z.string().min(1).max(50),
});

const joinSessionRequestSchema = z.object({
  participantName: z.string().min(1).max(50),
});

/**
 * POST /api/sessions
 * Create a new dinner decision session
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createSessionRequestSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Bad Request',
        code: 'VALIDATION_ERROR',
        message: 'hostName is required and must be 1-50 characters',
        details: validation.error.flatten(),
      });
    }

    const { hostName } = validation.data;

    // Create session
    const session = await SessionService.createSession(hostName);

    return res.status(201).json(session);
  } catch (error: any) {
    console.error('Error creating session:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

/**
 * GET /api/sessions/:sessionCode
 * Get session details
 */
router.get('/:sessionCode', async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;

    // Validate session code format
    if (!/^[A-Z0-9]{6}$/.test(sessionCode)) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: `Session ${sessionCode} not found or has expired`,
      });
    }

    // Get session
    const session = await SessionService.getSession(sessionCode);

    if (!session) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: `Session ${sessionCode} not found or has expired`,
      });
    }

    return res.status(200).json(session);
  } catch (error: any) {
    console.error('Error getting session:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

/**
 * POST /api/sessions/:sessionCode/join
 * Join an existing session
 */
router.post('/:sessionCode/join', async (req: Request, res: Response) => {
  try {
    const { sessionCode } = req.params;

    // Validate session code format
    if (!/^[A-Z0-9]{6}$/.test(sessionCode)) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: `Session ${sessionCode} not found or has expired`,
      });
    }

    // Validate request body
    const validation = joinSessionRequestSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Bad Request',
        code: 'VALIDATION_ERROR',
        message: 'participantName is required and must be 1-50 characters',
        details: validation.error.flatten(),
      });
    }

    const { participantName } = validation.data;

    // Generate participant ID (will be socket.id in WebSocket, UUID for REST)
    const participantId = `rest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Join session
    const result = await SessionService.joinSession(
      sessionCode,
      participantId,
      participantName
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error joining session:', error);

    if (error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        error: 'Not Found',
        code: 'SESSION_NOT_FOUND',
        message: `Session ${req.params.sessionCode} not found or has expired`,
      });
    }

    if (error.message === 'SESSION_FULL') {
      return res.status(403).json({
        error: 'Session is full',
        code: 'SESSION_FULL',
        message: 'This session has reached the maximum of 4 participants',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

export default router;