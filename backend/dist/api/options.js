import { Router } from 'express';
import { asyncHandler } from './asyncHandler.js';
import { redis } from '../redis/client.js';
import { parseRedisJson } from '../redis/json.js';
const router = Router();
router.get('/:sessionCode', asyncHandler(async (req, res) => {
    try {
        const { sessionCode } = req.params;
        if (!/^[A-Z0-9]{6}$/.test(sessionCode)) {
            console.warn('Rejected GET /api/options/:sessionCode', {
                sessionCode,
                reason: 'invalid_session_code',
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'SESSION_NOT_FOUND',
                message: 'Session not found',
            });
        }
        const sessionExists = await redis.exists(`session:${sessionCode}`);
        if (!sessionExists) {
            console.warn('Rejected GET /api/options/:sessionCode', {
                sessionCode,
                reason: 'session_not_found',
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'SESSION_NOT_FOUND',
                message: 'Session not found',
            });
        }
        const placeIds = await redis.smembers(`session:${sessionCode}:restaurant_ids`);
        if (placeIds.length === 0) {
            console.warn('Rejected GET /api/options/:sessionCode', {
                sessionCode,
                reason: 'no_restaurant_ids',
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'NO_RESTAURANTS',
                message: 'No restaurants found for this session',
            });
        }
        const restaurants = [];
        for (const placeId of placeIds) {
            const restaurantData = await redis.hget(`session:${sessionCode}:restaurants`, placeId);
            if (restaurantData) {
                restaurants.push(parseRedisJson(restaurantData));
            }
        }
        if (restaurants.length === 0) {
            console.warn('Rejected GET /api/options/:sessionCode', {
                sessionCode,
                reason: 'restaurant_records_missing',
                requestedRestaurantCount: placeIds.length,
            });
            return res.status(404).json({
                error: 'Not Found',
                code: 'NO_RESTAURANTS',
                message: 'No restaurants found for this session',
            });
        }
        console.log('Fetched restaurant options', {
            sessionCode,
            restaurantCount: restaurants.length,
        });
        return res.status(200).json({
            restaurants,
            sessionCode,
        });
    }
    catch (error) {
        console.error('Error getting restaurants:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again later.',
        });
    }
}));
export default router;
//# sourceMappingURL=options.js.map