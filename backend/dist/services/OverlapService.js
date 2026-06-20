import { redis } from '../redis/client.js';
import { parseRedisJson } from '../redis/json.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SelectionModel from '../models/Selection.js';
export async function calculateOverlap(sessionCode) {
    const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
    const participants = await ParticipantModel.listParticipants(sessionCode);
    if (participantIds.length === 0) {
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
    for (const placeId of overlappingPlaceIds) {
        const restaurantData = await redis.hget(`session:${sessionCode}:restaurants`, placeId);
        if (restaurantData) {
            overlappingOptions.push(parseRedisJson(restaurantData));
        }
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
    return {
        overlappingOptions,
        allSelections,
        restaurantNames,
        hasOverlap: overlappingOptions.length > 0,
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