import type { Restaurant } from '@dinder/shared/types';
export declare function calculateOverlap(sessionCode: string): Promise<{
    overlappingOptions: Restaurant[];
    allSelections: Record<string, string[]>;
    restaurantNames: Record<string, string>;
    hasOverlap: boolean;
}>;
export declare function storeResults(sessionCode: string, overlappingOptionIds: string[]): Promise<void>;
//# sourceMappingURL=OverlapService.d.ts.map