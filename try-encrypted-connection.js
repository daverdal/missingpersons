// Try connecting with encrypted connection (neo4j://)
require('dotenv').config();
const neo4j = require('neo4j-driver');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// Try with neo4j:// (encrypted) instead of bolt://
const encryptedUri = NEO4J_URI.replace('bolt://', 'neo4j://');

console.log('Trying encrypted connection...');
console.log(`URI: ${encryptedUri}`);
console.log(`User: ${NEO4J_USER}\n`);

const driver = neo4j.driver(
  encryptedUri,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  {
    encrypted: 'ENCRYPTION_ON',
    trust: 'TRUST_ALL_CERTIFICATES'
  }
);

const session = driver.session({ database: 'neo4j' });

session.run('RETURN 1')
  .then(async result => {
    console.log('✅ SUCCESS with encrypted connection!');
    console.log('Update your .env file:');
    console.log(`NEO4J_URI=${encryptedUri}`);
    await session.close();
    await driver.close();
    process.exit(0);
  })
  .catch(err => {
    console.log('❌ Encrypted connection failed:', err.message);
    console.log('\nTrying unencrypted connection...');
    
    // Try unencrypted
    const unencryptedDriver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      { encrypted: 'ENCRYPTION_OFF' }
    );
    
    const unencryptedSession = unencryptedDriver.session({ database: 'neo4j' });
    unencryptedSession.run('RETURN 1')
      .then(result => {
        console.log('✅ SUCCESS with unencrypted connection!');
        console.log('Your Neo4j server allows unencrypted connections.');
        unencryptedSession.close();
        unencryptedDriver.close();
        process.exit(0);
      })
      .catch(err2 => {
        console.log('❌ Both connection methods failed');
        console.log('Error:', err2.message);
        console.log('\nPossible issues:');
        console.log('1. Neo4j is not running');
        console.log('2. Wrong port (check if Neo4j is on a different port)');
        console.log('3. Wrong credentials');
        unencryptedSession.close();
        unencryptedDriver.close();
        process.exit(1);
      });
  });

