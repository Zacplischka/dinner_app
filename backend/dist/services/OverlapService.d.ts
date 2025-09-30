import type { DinnerOption } from '../constants/dinnerOptions.js';
export declare function calculateOverlap(sessionCode: string): Promise<{
    overlappingOptions: DinnerOption[];
    allSelections: Record<string, string[]>;
    hasOverlap: boolean;
}>;
export declare function storeResults(sessionCode: string, overlappingOptionIds: string[]): Promise<void>;
//# sourceMappingURL=OverlapService.d.ts.map