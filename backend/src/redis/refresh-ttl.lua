-- Lua script to atomically refresh EXPIREAT on multiple keys
-- Args: ARGV[1] = expireAt timestamp (Unix seconds)
-- Keys: All session-related keys to refresh

local expireAt = tonumber(ARGV[1])
for i = 1, #KEYS do
    redis.call('EXPIREAT', KEYS[i], expireAt)
end
return expireAt