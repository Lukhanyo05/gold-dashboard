import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (e) => console.error('❌ Redis error:', e.message));