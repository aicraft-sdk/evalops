import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { aiSdkService } from "./services/aiSdkService";

const app = express();

// Production security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: process.env.NODE_ENV === 'production' 
        ? ["'self'"] 
        : ["'self'", "'unsafe-inline'"], // Only allow unsafe-inline in development
      styleSrc: process.env.NODE_ENV === 'production'
        ? ["'self'", "https:"]
        : ["'self'", "'unsafe-inline'", "https:"], // Only allow unsafe-inline in development
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:", "https:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for Replit environment
}));

// Production-hardened CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS || 'https://*.replit.app').split(',')
    : true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  maxAge: 86400 // 24 hours preflight cache
};

app.use((req, res, next) => {
  const origin = req.get('origin');
  let allowCredentials = false;
  
  if (process.env.NODE_ENV === 'production') {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://*.replit.app').split(',');
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Fix CORS vulnerability: use proper anchored regex with escaped dots
        const pattern = '^' + allowed.replace(/\./g, '\\.').replace(/\*/g, '[^.]*') + '$';
        return new RegExp(pattern).test(origin || '');
      }
      return allowed === origin;
    });
    
    if (origin && isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      allowCredentials = true; // Only allow credentials for valid origins
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Don't allow credentials with wildcard origin in development
  }
  
  // Only set credentials header when we have a valid origin
  if (allowCredentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Rate limiting for production security
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Limit each IP to 100/1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes 
  max: 20, // More restrictive for sensitive endpoints
  message: {
    error: 'Rate limit exceeded for sensitive operation, please try again later.'
  }
});

app.use('/api', rateLimiter);
app.use('/api/auth', strictRateLimiter);
app.use('/api/runs', strictRateLimiter);

app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Global authentication enforcement for protected API routes
app.use('/api', (req, res, next) => {
  // Allow specific unauthenticated endpoints
  const publicEndpoints = [
    '/api/auth/',
    '/api/login',
    '/api/callback', 
    '/api/logout',
    '/api/webhooks/' // Webhooks use signature verification instead
  ];
  
  // Check if this is a public endpoint
  const isPublicEndpoint = publicEndpoints.some(endpoint => 
    req.path.startsWith(endpoint)
  );
  
  if (isPublicEndpoint || req.method === 'OPTIONS') {
    return next();
  }
  
  // For production, ensure all other API routes have authentication
  if (process.env.NODE_ENV === 'production') {
    // Check if route will be handled by authentication middleware in routes
    // This serves as a safety net to ensure no routes bypass authentication
    const authHeader = req.headers.authorization;
    const hasSession = req.session && req.session.passport;
    
    if (!authHeader && !hasSession) {
      return res.status(401).json({ 
        message: 'Authentication required for this endpoint' 
      });
    }
  }
  
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize AI SDK service first
  await aiSdkService.initialize();
  log("AI SDK service initialized successfully");
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
