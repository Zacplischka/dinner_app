import { redis } from '../redis/client.js';
import { parseRedisJson } from '../redis/json.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SelectionModel from '../models/Selection.js';
export async function calculateOverlap(sessionCode) {
    const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
    const participants = await ParticipantModel.listParticipants(sessionCode);
    if (participantIds.length === 0) {
        console.log('Calculated overlap for empty session', {
            sessionCode,
            participantCount: 0,
        });
        return {
            overlappingOptions: [],
            allSelections: {},
            restaurantNames: {},
            hasOverlap: false,
        };
    }
    const selectionKeys = participantIds.map((id) => `session:${sessionCode}:${id}:selections`);
    let overlappingPlaceIds = [];
    if (selectionKeys.length === 1) {
        overlappingPlaceIds = await redis.smembers(selectionKeys[0]);
    }
    else {
        overlappingPlaceIds = await redis.sinter(...selectionKeys);
    }
    const overlappingOptions = [];
    let missingRestaurantCount = 0;
    for (const placeId of overlappingPlaceIds) {
        const restaurantData = await redis.hget(`session:${sessionCode}:restaurants`, placeId);
        if (restaurantData) {
            overlappingOptions.push(parseRedisJson(restaurantData));
        }
        else {
            missingRestaurantCount++;
        }
    }
    if (missingRestaurantCount > 0) {
        console.warn('Overlap calculation skipped missing restaurant data', {
            sessionCode,
            missingRestaurantCount,
        });
    }
    const allSelections = {};
    for (const participant of participants) {
        const selections = await SelectionModel.getSelections(sessionCode, participant.participantId);
        allSelections[participant.displayName] = selections;
    }
    const allPlaceIds = new Set();
    for (const selections of Object.values(allSelections)) {
        for (const placeId of selections) {
            allPlaceIds.add(placeId);
        }
    }
    const restaurantNames = {};
    for (const placeId of allPlaceIds) {
        const restaurantData = await redis.hget(`session:${sessionCode}:restaurants`, placeId);
        if (restaurantData) {
            const restaurant = parseRedisJson(restaurantData);
            restaurantNames[placeId] = restaurant.name;
        }
    }
    const hasOverlap = overlappingOptions.length > 0;
    console.log('Calculated session overlap', {
        sessionCode,
        participantCount: participantIds.length,
        overlappingCount: overlappingOptions.length,
        hasOverlap,
    });
    return {
        overlappingOptions,
        allSelections,
        restaurantNames,
        hasOverlap,
    };
}
export async function storeResults(sessionCode, overlappingOptionIds) {
    if (overlappingOptionIds.length > 0) {
        await redis.sadd(`session:${sessionCode}:results`, ...overlappingOptionIds);
    }
    else {
        await redis.sadd(`session:${sessionCode}:results`, '__empty__');
    }
}
//# sourceMappingURL=OverlapService.js.map