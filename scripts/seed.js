// Simple seed runner for Neo4j using env-configured connection
// Reads purge_and_seed.cypher and executes statements sequentially

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');

async function run() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';
  const database = process.env.NEO4J_DATABASE || 'neo4j';

  const filePath = path.join(__dirname, '..', 'purge_and_seed.cypher');
  const raw = fs.readFileSync(filePath, 'utf8');
  const text = raw.replace(/\r/g, '');
  // Split on semicolons; ignore empty/comment-only chunks
  const queries = text
    .split(';')
    .map(q => q.trim())
    .filter(q => q && !q.split('\n').every(line => line.trim().startsWith('//') || line.trim() === ''));

  if (!queries.length) {
    console.log('No queries found in purge_and_seed.cypher');
    process.exit(0);
  }

  console.log(`Connecting to ${uri} (db=${database}) as ${user} ...`);
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session({ database });
  try {
    let i = 0;
    for (const q of queries) {
      i += 1;
      console.log(`Running statement ${i}/${queries.length} ...`);
      await session.run(q);
    }
    console.log('Seed completed successfully.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await session.close();
    await driver.close();
  }
}

run();






