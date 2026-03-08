/**
 * Centralized configuration factory.
 * All environment variables should be accessed through this configuration.
 */
export default () => ({
  // Server
  port: parseInt(process.env.PORT || '5555', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    url: process.env.DATABASE_URL,
  },

  // Clerk Authentication
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Google OAuth
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },

  // Asaas Payment Gateway
  asaas: {
    apiKey: process.env.ASAAS_API_KEY,
    baseUrl: process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3',
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
  },

  // Storage (Google Cloud Storage)
  storage: {
    gcpProjectId: process.env.GCP_PROJECT_ID,
    gcpBucket: process.env.GCP_BUCKET,
    gcpKeyFile: process.env.GCP_KEY_FILE,
  },

  // Email
  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM || 'noreply@sistema.com.br',
  },

  // Redis (for Socket.io adapter)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  // Application URLs
  urls: {
    frontend: process.env.FRONTEND_URL || 'http://localhost:3000',
    backend: process.env.BACKEND_URL || 'http://localhost:5555',
  },

  // Rate Limiting
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
    limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
});

/**
 * Type-safe configuration access.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  clerk: {
    secretKey: string;
    webhookSecret: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  asaas: {
    apiKey: string;
    baseUrl: string;
    webhookToken: string;
  };
  storage: {
    gcpProjectId: string;
    gcpBucket: string;
    gcpKeyFile: string;
  };
  mail: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  urls: {
    frontend: string;
    backend: string;
  };
  rateLimit: {
    ttl: number;
    limit: number;
  };
}
