export interface YelpEnrichmentResult {
    yelpUrl?: string;
    yelpId?: string;
}
export declare function matchBusinessToYelp(name: string, address: string): Promise<YelpEnrichmentResult>;
export declare function enrichRestaurantsWithYelp(restaurants: Array<{
    name: string;
    address?: string;
}>): Promise<Map<string, YelpEnrichmentResult>>;
//# sourceMappingURL=YelpService.d.ts.map