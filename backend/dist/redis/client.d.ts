import Redis from 'ioredis';
export declare const redis: Redis;
export declare function pingRedis(): Promise<boolean>;
export declare function disconnectRedis(): Promise<void>;
//# sourceMappingURL=client.d.ts.map