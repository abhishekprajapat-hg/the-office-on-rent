const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const createTtlCache = ({ ttlMs = 30000, maxEntries = 500 } = {}) => {
  const cache = new Map();
  const resolvedTtlMs = toPositiveInt(ttlMs, 30000);
  const resolvedMaxEntries = toPositiveInt(maxEntries, 500);

  const get = (key) => {
    const entry = cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }

    return entry.value;
  };

  const set = (key, value) => {
    if (!key) return;

    if (cache.size >= resolvedMaxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }

    cache.set(key, {
      value,
      expiresAt: Date.now() + resolvedTtlMs,
    });
  };

  const del = (key) => {
    cache.delete(key);
  };

  const clear = () => {
    cache.clear();
  };

  return {
    get,
    set,
    delete: del,
    clear,
  };
};

module.exports = {
  createTtlCache,
};
