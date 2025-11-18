// configModel.js
// Simple key/value configuration storage in Neo4j.
// Used to persist settings like Offender News email credentials.

class ConfigModel {
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * Get config value for a given key.
   * Returns parsed JSON object or null if not found.
   */
  async get(key) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (c:Config {key: $key}) RETURN c LIMIT 1',
        { key }
      );
      if (!result.records.length) return null;
      const node = result.records[0].get('c');
      const value = node.properties && node.properties.value;
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Set config value for a given key.
   * The value object will be stored as JSON string in property "value".
   */
  async set(key, value) {
    const session = this.driver.session();
    try {
      await session.run(
        `
        MERGE (c:Config {key: $key})
        SET c.value = $value,
            c.updatedAt = datetime()
        `,
        { key, value: JSON.stringify(value || {}) }
      );
    } finally {
      await session.close();
    }
  }
}

module.exports = ConfigModel;


