export interface DinnerOption {
    optionId: string;
    displayName: string;
    description?: string;
}
export declare const DINNER_OPTIONS: DinnerOption[];
export declare function validateDinnerOptions(): void;
export declare function getDinnerOptionById(optionId: string): DinnerOption | undefined;
export declare function validateOptionIds(optionIds: string[]): boolean;
//# sourceMappingURL=dinnerOptions.d.ts.map