// Script to get Neo4j database schema information
// Usage: node get-db-schema.js

require('dotenv').config();
const neo4j = require('neo4j-driver');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

// Neo4j 4.0+ encryption configuration
const isEncrypted = NEO4J_URI.startsWith('neo4j://') || NEO4J_URI.startsWith('neo4j+s://');
let encryptionSetting;
try {
  encryptionSetting = isEncrypted ? neo4j.util.ENCRYPTION_ON : neo4j.util.ENCRYPTION_OFF;
} catch (e) {
  encryptionSetting = isEncrypted ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF';
}

const driverConfig = isEncrypted 
  ? {
      encrypted: encryptionSetting,
      trust: 'TRUST_ALL_CERTIFICATES'
    }
  : {
      encrypted: encryptionSetting
    };

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  driverConfig
);

async function getDatabaseSchema() {
  // Try to determine the correct database name
  let dbName = NEO4J_DATABASE;
  
  // First, try to list available databases (Neo4j 4.0+)
  console.log('Checking available databases...');
  try {
    const adminSession = driver.session({ database: 'system' });
    const dbListResult = await adminSession.run('SHOW DATABASES');
    const databases = dbListResult.records.map(record => {
      const name = record.get('name');
      // Try different possible field names for current/default status
      const isDefault = record.get('default') || record.get('currentStatus') === 'online' || false;
      return { name, isDefault };
    });
    await adminSession.close();
    
    console.log(`Available databases: ${databases.map(d => d.name).join(', ')}`);
    const dbNames = databases.map(d => d.name);
    
    // Check for exact match (case-sensitive)
    if (dbNames.includes(dbName)) {
      console.log(`Found exact match: ${dbName}`);
    } else {
      // Check for case-insensitive match
      const caseInsensitiveMatch = dbNames.find(d => d.toLowerCase() === dbName.toLowerCase());
      if (caseInsensitiveMatch) {
        console.log(`Found case-insensitive match: ${caseInsensitiveMatch} (configured: ${dbName})`);
        dbName = caseInsensitiveMatch;
      } else {
        // Try to find the default database
        const defaultDb = databases.find(d => d.isDefault);
        if (defaultDb) {
          console.log(`Warning: Database '${NEO4J_DATABASE}' not found. Using default database: ${defaultDb.name}`);
          dbName = defaultDb.name;
        } else if (dbNames.includes('neo4j')) {
          dbName = 'neo4j';
          console.log(`Warning: Database '${NEO4J_DATABASE}' not found. Using 'neo4j' instead.`);
        } else if (dbNames.length > 0) {
          dbName = dbNames[0];
          console.log(`Warning: Database '${NEO4J_DATABASE}' not found. Using '${dbName}' instead.`);
        } else {
          console.log(`Error: No databases found. Trying to use configured name: ${dbName}`);
        }
      }
    }
  } catch (err) {
    // If we can't list databases (older Neo4j version or permission issue), just use the configured name
    console.log(`Note: Could not list databases (${err.message}). Using configured database: ${dbName}`);
    console.log(`If this fails, the database might need to be created or you might need different permissions.`);
  }
  
  // Try to connect to the configured database first, even if it wasn't in the list
  // Sometimes Neo4j Desktop shows a different name than the actual database name
  let session;
  let connectedDbName = dbName;
  
  try {
    // First, try the configured database name
    session = driver.session({ database: NEO4J_DATABASE });
    // Test the connection by running a simple query
    await session.run('RETURN 1 as test');
    connectedDbName = NEO4J_DATABASE;
    console.log(`Successfully connected to configured database: ${NEO4J_DATABASE}`);
  } catch (err) {
    // If that fails, try the database we found in the list
    console.log(`Could not connect to '${NEO4J_DATABASE}': ${err.message}`);
    console.log(`Trying database: ${dbName}`);
    session = driver.session({ database: dbName });
    try {
      await session.run('RETURN 1 as test');
      connectedDbName = dbName;
    } catch (err2) {
      console.error(`Could not connect to '${dbName}': ${err2.message}`);
      throw err2;
    }
  }
  
  try {
    console.log('='.repeat(80));
    console.log('NEO4J DATABASE SCHEMA');
    console.log('='.repeat(80));
    console.log(`Database: ${connectedDbName}`);
    console.log(`URI: ${NEO4J_URI}`);
    if (connectedDbName !== NEO4J_DATABASE) {
      console.log(`Note: Connected to '${connectedDbName}' instead of configured '${NEO4J_DATABASE}'`);
    }
    console.log('='.repeat(80));
    console.log('');

    // Get all labels
    console.log('NODE LABELS:');
    console.log('-'.repeat(80));
    try {
      const labelsResult = await session.run('CALL db.labels()');
      const labels = labelsResult.records.map(record => record.get('label'));
      if (labels.length === 0) {
        console.log('(no labels found)');
      } else {
        labels.forEach(label => console.log(`  - ${label}`));
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log('');

    // Get all relationship types
    console.log('RELATIONSHIP TYPES:');
    console.log('-'.repeat(80));
    try {
      const relTypesResult = await session.run('CALL db.relationshipTypes()');
      const relTypes = relTypesResult.records.map(record => record.get('relationshipType'));
      if (relTypes.length === 0) {
        console.log('(no relationship types found)');
      } else {
        relTypes.forEach(relType => console.log(`  - ${relType}`));
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log('');

    // Get all property keys
    console.log('PROPERTY KEYS:');
    console.log('-'.repeat(80));
    try {
      const propKeysResult = await session.run('CALL db.propertyKeys()');
      const propKeys = propKeysResult.records.map(record => record.get('propertyKey'));
      if (propKeys.length === 0) {
        console.log('(no property keys found)');
      } else {
        propKeys.forEach(propKey => console.log(`  - ${propKey}`));
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log('');

    // Get node counts per label
    console.log('NODE COUNTS BY LABEL:');
    console.log('-'.repeat(80));
    try {
      const labelsResult = await session.run('CALL db.labels()');
      const labels = labelsResult.records.map(record => record.get('label'));
      
      for (const label of labels) {
        try {
          const countResult = await session.run(`MATCH (n:${label}) RETURN count(n) as count`);
          const count = countResult.records[0].get('count').toNumber();
          console.log(`  ${label}: ${count}`);
        } catch (err) {
          console.log(`  ${label}: (error getting count)`);
        }
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log('');

    // Get relationship counts per type
    console.log('RELATIONSHIP COUNTS BY TYPE:');
    console.log('-'.repeat(80));
    try {
      const relTypesResult = await session.run('CALL db.relationshipTypes()');
      const relTypes = relTypesResult.records.map(record => record.get('relationshipType'));
      
      for (const relType of relTypes) {
        try {
          const countResult = await session.run(`MATCH ()-[r:${relType}]->() RETURN count(r) as count`);
          const count = countResult.records[0].get('count').toNumber();
          console.log(`  ${relType}: ${count}`);
        } catch (err) {
          console.log(`  ${relType}: (error getting count)`);
        }
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log('');

    console.log('='.repeat(80));
    console.log('END OF SCHEMA');
    console.log('='.repeat(80));

  } catch (err) {
    console.error('Error getting database schema:', err);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the script
getDatabaseSchema().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

