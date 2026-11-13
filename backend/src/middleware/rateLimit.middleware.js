const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildRateLimitMessage = (message) => ({
  message,
});

/*
 * Signed-in requests are counted per user, not per IP address. Counted per IP,
 * everyone in an office behind one internet connection shared a single budget,
 * so one person's bulk delete could block a colleague's upload. Only a token
 * that verifies counts as a user (a made-up token cannot buy a fresh budget);
 * anything else - signed out, expired - is counted per IP as before.
 */
const userOrIpKey = (req) => {
  const header = String(req.headers?.authorization || "");
  if (header.startsWith("Bearer ") && process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(header.slice(7).trim(), process.env.JWT_SECRET);
      const userId = decoded?.id || decoded?._id || decoded?.userId;
      if (userId) return `user:${userId}`;
    } catch {
      // Invalid or expired token: fall through to the IP.
    }
  }
  return `ip:${req.ip}`;
};

const createLimiter = ({
  windowMs,
  max,
  message,
  skipSuccessfulRequests = false,
  perUser = false,
}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: buildRateLimitMessage(message),
    ...(perUser ? { keyGenerator: userOrIpKey } : {}),
  });

// Per user. A bulk action on a page of 100 leads is 100 requests, plus the
// page's own reads, so the budget leaves room for that.
const apiLimiter = createLimiter({
  windowMs: toPositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.API_RATE_LIMIT_MAX, 600),
  message: "Too many requests. Please retry in a moment.",
  perUser: true,
});

const authLimiter = createLimiter({
  windowMs: toPositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000),
  max: toPositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 8),
  message: "Too many failed auth attempts. Please retry later.",
  skipSuccessfulRequests: true,
});

const webhookLimiter = createLimiter({
  windowMs: toPositiveInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.WEBHOOK_RATE_LIMIT_MAX, 120),
  message: "Webhook rate limit exceeded.",
});

// Per user, shared by every write route. Bulk delete and bulk transfer send one
// request per lead, so 80 a minute stopped a 100-lead bulk action half way.
const writeLimiter = createLimiter({
  windowMs: toPositiveInt(process.env.WRITE_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.WRITE_RATE_LIMIT_MAX, 300),
  message: "Too many changes in a short time. Please wait a minute and try again.",
  perUser: true,
});

const chatMessageLimiter = createLimiter({
  windowMs: toPositiveInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toPositiveInt(process.env.CHAT_RATE_LIMIT_MAX, 45),
  message: "Too many chat messages. Please slow down.",
  perUser: true,
});

module.exports = {
  userOrIpKey,
  apiLimiter,
  authLimiter,
  webhookLimiter,
  writeLimiter,
  chatMessageLimiter,
};
