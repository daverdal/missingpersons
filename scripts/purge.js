// Purge script to delete all nodes and relationships from Neo4j database
// WARNING: This will delete ALL data in the database!

require('dotenv').config();
const neo4j = require('neo4j-driver');

async function run() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';
  const database = process.env.NEO4J_DATABASE || 'neo4j';

  console.log(`Connecting to ${uri} (db=${database}) as ${user} ...`);
  
  // Handle encryption for Neo4j 4.0+
  const isEncrypted = uri.startsWith('neo4j://') || uri.startsWith('neo4j+s://');
  const driverConfig = {
    encrypted: isEncrypted ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
    trust: 'TRUST_ALL_CERTIFICATES'
  };
  
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), driverConfig);
  
  // Try to use the specified database, fall back to 'neo4j' if it doesn't exist
  let session = driver.session({ database });
  let actualDatabase = database;
  
  try {
    // Test if database exists by trying a simple query
    await session.run('RETURN 1');
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      console.log(`Database '${database}' does not exist. Trying 'neo4j' instead...`);
      await session.close();
      actualDatabase = 'neo4j';
      session = driver.session({ database: actualDatabase });
    } else {
      throw err;
    }
  }
  
  try {
    console.log(`WARNING: This will delete ALL nodes and relationships in database '${actualDatabase}'!`);
    console.log('Purging database...');
    
    const result = await session.run('MATCH (n) DETACH DELETE n RETURN count(n) as deleted');
    const deletedCount = result.records[0].get('deleted');
    
    console.log(`Successfully deleted ${deletedCount} nodes and all relationships.`);
    console.log('Database purge completed.');
  } catch (err) {
    console.error('Purge failed:', err.message);
    process.exitCode = 1;
  } finally {
    await session.close();
    await driver.close();
  }
}

run();

