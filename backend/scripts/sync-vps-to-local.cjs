const path = require("path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const SOURCE_URI = process.env.MONGO_VPS_URI;
const TARGET_URI = process.env.MONGO_URI;

const parseDbNameFromUri = (uri, fallback) => {
  try {
    const protocolReplaced = uri.replace(/^mongodb(\+srv)?:\/\//i, "http://");
    const parsed = new URL(protocolReplaced);
    const pathname = String(parsed.pathname || "").replace(/^\/+/, "");
    if (!pathname) return fallback;
    return decodeURIComponent(pathname.split("/")[0]);
  } catch {
    return fallback;
  }
};

const sourceDbName =
  process.env.MONGO_VPS_DB_NAME ||
  parseDbNameFromUri(SOURCE_URI || "", "samvid_db");
const targetDbName =
  process.env.MONGO_LOCAL_DB_NAME ||
  parseDbNameFromUri(TARGET_URI || "", "samvid_db");

const mapIndexDefinition = (indexDefinition) => {
  const {
    v,
    ns,
    background,
    sparse,
    unique,
    expireAfterSeconds,
    partialFilterExpression,
    collation,
    weights,
    default_language,
    language_override,
    textIndexVersion,
    "2dsphereIndexVersion": twoSphereIndexVersion,
    bits,
    min,
    max,
    bucketSize,
    wildcardProjection,
    hidden,
    name,
    key,
  } = indexDefinition;

  const options = {
    name,
    unique,
    sparse,
    expireAfterSeconds,
    partialFilterExpression,
    collation,
    weights,
    default_language,
    language_override,
    textIndexVersion,
    "2dsphereIndexVersion": twoSphereIndexVersion,
    bits,
    min,
    max,
    bucketSize,
    wildcardProjection,
    hidden,
  };

  const cleanOptions = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );

  return {
    key,
    ...cleanOptions,
  };
};

const syncVpsToLocal = async () => {
  if (!SOURCE_URI) {
    throw new Error(
      "MONGO_VPS_URI is missing in backend/.env. Add it before syncing.",
    );
  }
  if (!TARGET_URI) {
    throw new Error(
      "MONGO_URI is missing in backend/.env. Add it before syncing.",
    );
  }

  const sourceClient = new MongoClient(SOURCE_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  });
  const targetClient = new MongoClient(TARGET_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  });

  try {
    console.log(`Connecting source: ${sourceDbName}`);
    await sourceClient.connect();
    console.log(`Connecting target: ${targetDbName}`);
    await targetClient.connect();

    const sourceDb = sourceClient.db(sourceDbName);
    const targetDb = targetClient.db(targetDbName);

    const sourceCollections = (
      await sourceDb.listCollections({}, { nameOnly: true }).toArray()
    )
      .map((collection) => collection.name)
      .filter((name) => !name.startsWith("system."));

    if (!sourceCollections.length) {
      console.log("No collections found on source DB. Nothing to sync.");
      return;
    }

    console.log(
      `Source collections: ${sourceCollections.length}. Replacing local DB data...`,
    );
    await targetDb.dropDatabase();

    for (const collectionName of sourceCollections) {
      const sourceCollection = sourceDb.collection(collectionName);
      const targetCollection = targetDb.collection(collectionName);

      const indexDefinitions = await sourceCollection.indexes();
      let insertedCount = 0;
      let batch = [];

      const cursor = sourceCollection.find({});
      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= 500) {
          await targetCollection.insertMany(batch, { ordered: false });
          insertedCount += batch.length;
          batch = [];
        }
      }

      if (batch.length > 0) {
        await targetCollection.insertMany(batch, { ordered: false });
        insertedCount += batch.length;
      }

      const extraIndexes = indexDefinitions
        .filter((index) => index.name !== "_id_")
        .map(mapIndexDefinition);

      if (extraIndexes.length > 0) {
        await targetCollection.createIndexes(extraIndexes);
      }

      const localCount = await targetCollection.countDocuments();
      console.log(
        `${collectionName}: copied ${insertedCount} docs (local: ${localCount})`,
      );
    }

    console.log("Sync complete. Local DB now mirrors VPS DB snapshot.");
  } finally {
    await Promise.allSettled([sourceClient.close(), targetClient.close()]);
  }
};

syncVpsToLocal().catch((error) => {
  console.error(`Sync failed: ${error.message}`);
  process.exit(1);
});

