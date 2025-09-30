import { Router } from 'express';
import { DINNER_OPTIONS } from '../constants/dinnerOptions.js';
const router = Router();
router.get('/', (_req, res) => {
    try {
        return res.status(200).json({
            options: DINNER_OPTIONS,
        });
    }
    catch (error) {
        console.error('Error getting options:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again later.',
        });
    }
});
export default router;
//# sourceMappingURL=options.js.map