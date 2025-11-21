// Seed script to restore all 63 Manitoba First Nations communities
// Reads Manitoba63Cypher.cypher and executes the CREATE statements

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');

async function run() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';
  const database = process.env.NEO4J_DATABASE || 'neo4j';

  const filePath = path.join(__dirname, '..', 'Manitoba63Cypher.cypher');
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const text = raw.replace(/\r/g, '');
  
  // Split on semicolons; ignore empty/comment-only chunks
  const queries = text
    .split(';')
    .map(q => q.trim())
    .filter(q => q && !q.split('\n').every(line => line.trim().startsWith('//') || line.trim() === ''));

  if (!queries.length) {
    console.log('No queries found in Manitoba63Cypher.cypher');
    process.exit(0);
  }

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
      try {
        await session.run('RETURN 1');
      } catch (err2) {
        console.error('Failed to connect to Neo4j:', err2.message);
        await driver.close();
        process.exit(1);
      }
    } else {
      console.error('Failed to connect to Neo4j:', err.message);
      await driver.close();
      process.exit(1);
    }
  }

  console.log(`Using database: ${actualDatabase}`);
  console.log(`Found ${queries.length} queries to execute...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (!query) continue;

    try {
      const result = await session.run(query);
      successCount++;
      if (query.includes('CREATE (:Community')) {
        // Extract community name for logging
        const nameMatch = query.match(/name:\s*'([^']+)'/);
        const name = nameMatch ? nameMatch[1] : 'Unknown';
        console.log(`✓ Created: ${name}`);
      } else if (query.includes('DELETE')) {
        console.log(`✓ Deleted existing communities`);
      }
    } catch (err) {
      errorCount++;
      console.error(`✗ Error executing query ${i + 1}:`, err.message);
      if (query.length < 200) {
        console.error(`  Query: ${query.substring(0, 200)}...`);
      }
    }
  }

  await session.close();
  await driver.close();

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${queries.length}`);
  
  if (errorCount === 0) {
    console.log('\n✓ All communities seeded successfully!');
  } else {
    console.log('\n⚠ Some errors occurred. Please review the output above.');
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

