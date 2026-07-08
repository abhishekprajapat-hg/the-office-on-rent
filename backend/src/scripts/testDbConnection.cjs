require("dotenv").config();

const mongoose = require("mongoose");

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseMongoDbName = (mongoUri) => {
  try {
    const parsed = new URL(
      String(mongoUri || "").replace(/^mongodb(\+srv)?:\/\//i, "http://"),
    );
    return decodeURIComponent(
      String(parsed.pathname || "").replace(/^\/+/, "").split("/")[0] || "",
    );
  } catch {
    return "";
  }
};

const run = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is missing.");
  }

  const expectedDbName = parseMongoDbName(mongoUri);
  await mongoose.connect(mongoUri, {
    maxPoolSize: toPositiveInt(process.env.MONGO_MAX_POOL_SIZE, 5),
    minPoolSize: toPositiveInt(process.env.MONGO_MIN_POOL_SIZE, 1),
    connectTimeoutMS: toPositiveInt(process.env.MONGO_CONNECT_TIMEOUT_MS, 10000),
    serverSelectionTimeoutMS: toPositiveInt(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
      10000,
    ),
  });

  const connection = mongoose.connection;
  console.log("MongoDB connection test passed");
  console.log(`Database: ${connection.db?.databaseName || expectedDbName || "unknown"}`);
  console.log(`Ready state: ${connection.readyState}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(`MongoDB connection test failed: ${error.message}`);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect failures while exiting after a failed connection test.
  }
  process.exit(1);
});
