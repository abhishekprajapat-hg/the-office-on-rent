const SHARED_DB_OVERRIDE = "ALLOW_SHARED_DB_SEED";

const truthyValues = new Set(["1", "true", "yes", "y", "on"]);

const parseBooleanEnv = (value) =>
  truthyValues.has(String(value || "").trim().toLowerCase());

const parseMongoTarget = (mongoUri) => {
  try {
    const parsed = new URL(
      String(mongoUri || "").replace(/^mongodb(\+srv)?:\/\//i, "http://"),
    );
    const dbName = decodeURIComponent(
      String(parsed.pathname || "").replace(/^\/+/, "").split("/")[0] || "",
    );

    return {
      host: parsed.hostname,
      port: parsed.port || "27017",
      dbName,
      username: parsed.username ? "<present>" : "",
      authSource: parsed.searchParams.get("authSource") || "",
    };
  } catch {
    return {
      host: "",
      port: "",
      dbName: "",
      username: "",
      authSource: "",
    };
  }
};

const isLoopbackHost = (host) =>
  ["localhost", "127.0.0.1", "::1", "[::1]"].includes(String(host || "").toLowerCase());

const isLikelySharedDatabase = ({ target, destructive }) => {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const explicitShared = parseBooleanEnv(process.env.SHARED_DB)
    || parseBooleanEnv(process.env.USE_SHARED_DB)
    || parseBooleanEnv(process.env.VPS_MONGO_SHARED);
  const productionLikeName = ["the_office_on_rent"].includes(
    String(target.dbName || "").toLowerCase(),
  );

  return Boolean(
    explicitShared
      || nodeEnv === "production"
      || !isLoopbackHost(target.host)
      || target.port === "27018"
      || target.username
      || target.authSource
      || (destructive && productionLikeName),
  );
};

const assertSeedAllowed = ({ scriptName, destructive = true } = {}) => {
  const target = parseMongoTarget(process.env.MONGO_URI);
  const looksShared = isLikelySharedDatabase({ target, destructive });
  const allowSharedSeed = parseBooleanEnv(process.env[SHARED_DB_OVERRIDE]);
  const label = scriptName || "seed script";
  const targetSummary = `${target.host || "unknown-host"}:${target.port || "unknown-port"}/${target.dbName || "unknown-db"}`;

  if (looksShared && !allowSharedSeed) {
    throw new Error(
      [
        `${label} blocked by shared database safety guard.`,
        `Target looks shared/production-like: ${targetSummary}.`,
        `Set ${SHARED_DB_OVERRIDE}=true only after taking a backup and confirming this write is intentional.`,
      ].join(" "),
    );
  }

  const warningPrefix = looksShared
    ? "WARNING: shared database seed override is enabled"
    : "Seed safety guard";
  console.warn(
    [
      `${warningPrefix}.`,
      `script=${label}`,
      `target=${targetSummary}`,
      `destructive=${destructive ? "yes" : "no"}`,
    ].join(" "),
  );
};

module.exports = {
  assertSeedAllowed,
};
