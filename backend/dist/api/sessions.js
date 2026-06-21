import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from './asyncHandler.js';
import * as SessionService from '../services/SessionService.js';
const router = Router();
const createSessionRequestSchema = z.object({
    hostName: z.string().min(1).max(50),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        address: z.string().optional(),
    }).optional(),
    searchRadiusMiles: z.number().min(1).max(15).optional(),
});
const joinSessionRequestSchema = z.object({
    participantName: z.string().min(1).max(50),
});
function validationFields(error) {
    return [...new Set(error.issues.map((issue) => String(issue.path[0] ?? 'body')))];
}
router.post('/', asyncHandler(async (req, res) => {
    try {
        const validation = createSessionRequestSchema.safeParse(req.body);
        if (!validation.success) {
            console.warn('Rejected POST /api/sessions', {
                reason: 'validation_error',
                fields: validationFields(validation.error),
            });
            return res.status(400).json({
                error: 'Bad Request',
                code: 'VALIDATION_ERROR',
                message: 'hostName is required and must be 1-50 characters',
                details: validation.error.flatten(),
            });
        }
        const { hostName, location, searchRadiusMiles } = validation.data;
        const radius = location && searchRadiusMiles === undefined ? 5 : searchRadiusMiles;
        const session = await SessionService.createSession(hostName, location, radius);
        console.log('Created REST session', {
            sessionCode: session.sessionCode,
            hasLocation: Boolean(location),
            searchRadiusMiles: radius,
            restaurantCount: session.restaurantCount ?? 0,
        });
        return res.status(201).json(session);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'NO_RESTAURANTS_FOUND') {
            console.warn('Rejected POST /api/sessions', {
                reason: 'no_restaurants_found',
                hasLocation: Boolean(req.body?.location),
                searchRadiusMiles: req.body?.searchRadiusMiles,
            });
            return res.status(400).json({
                error: 'Bad Request',
                code: 'NO_RESTAURANTS_FOUND',
                message: 'No restaurants found in the specified area. Try expanding your search radius.',
            });
        }
        console.error('Error creating session:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again later.',
        });
    }
}));
router.get('/:sessionCode', asyncHandler(async (req, res) => {
    try {
        const { sessionCode } = req.params;
        if (!/^[A-Z0-9]{6}$/.test(sessionCode)) {
            console.warn('Rejected GET /api/sessions/:sessionCode', {
                sessionCode,
                reason: 'invalid_session_code',
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'SESSION_NOT_FOUND',
                message: `Session ${sessionCode} not found or has expired`,
            });
        }
        const session = await SessionService.getSession(sessionCode);
        if (!session) {
            console.warn('Rejected GET /api/sessions/:sessionCode', {
                sessionCode,
                reason: 'session_not_found',
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'SESSION_NOT_FOUND',
                message: `Session ${sessionCode} not found or has expired`,
            });
        }
        console.log('Fetched REST session', {
            sessionCode,
            state: session.state,
            participantCount: session.participantCount,
        });
        return res.status(200).json(session);
    }
    catch (error) {
        console.error('Error getting session:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again later.',
        });
    }
}));
router.post('/:sessionCode/join', asyncHandler(async (req, res) => {
    try {
        const { sessionCode } = req.params;
        if (!/^[A-Z0-9]{6}$/.test(sessionCode)) {
            console.warn('Rejected POST /api/sessions/:sessionCode/join', {
                sessionCode,
                reason: 'invalid_session_code',
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'SESSION_NOT_FOUND',
                message: `Session ${sessionCode} not found or has expired`,
            });
        }
        const validation = joinSessionRequestSchema.safeParse(req.body);
        if (!validation.success) {
            console.warn('Rejected POST /api/sessions/:sessionCode/join', {
                sessionCode,
                reason: 'validation_error',
                fields: validationFields(validation.error),
            });
            return res.status(400).json({
                error: 'Bad Request',
                code: 'VALIDATION_ERROR',
                message: 'participantName is required and must be 1-50 characters',
                details: validation.error.flatten(),
            });
        }
        const { participantName } = validation.data;
        const participantId = `rest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const result = await SessionService.joinSession(sessionCode, participantId, participantName);
        console.log('Joined REST session', {
            sessionCode,
            participantId: result.participantId,
            participantCount: result.participantCount,
        });
        return res.status(200).json(result);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
            console.warn('Rejected POST /api/sessions/:sessionCode/join', {
                sessionCode: req.params.sessionCode,
                reason: 'session_not_found',
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'SESSION_NOT_FOUND',
                message: `Session ${req.params.sessionCode} not found or has expired`,
            });
        }
        if (error instanceof Error && error.message === 'SESSION_FULL') {
            console.warn('Rejected POST /api/sessions/:sessionCode/join', {
                sessionCode: req.params.sessionCode,
                reason: 'session_full',
            });
            return res.status(403).json({
                error: 'Session is full',
                code: 'SESSION_FULL',
                message: 'This session has reached the maximum of 4 participants',
            });
        }
        console.error('Error joining session:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again later.',
        });
    }
}));
export default router;
//# sourceMappingURL=sessions.js.map