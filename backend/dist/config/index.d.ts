export declare const config: {
    port: number;
    redisHost: string;
    redisPort: number;
    redisPassword: string;
    frontendUrl: string;
    nodeEnv: string;
    googlePlaces: {
        apiKey: string | undefined;
        apiUrl: string;
    };
    supabase: {
        url: string;
        jwtSecret: string;
        serviceRoleKey: string;
    };
};
export declare function validateConfig(): void;
//# sourceMappingURL=index.d.ts.map