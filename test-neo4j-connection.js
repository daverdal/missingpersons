// Test Neo4j connection script
// Run with: node test-neo4j-connection.js

require('dotenv').config();
const neo4j = require('neo4j-driver');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

console.log('Testing Neo4j Connection...');
console.log(`URI: ${NEO4J_URI}`);
console.log(`User: ${NEO4J_USER}`);
console.log(`Database: ${NEO4J_DATABASE}`);
console.log('Password: ' + (NEO4J_PASSWORD ? '***' : '(not set)'));
console.log('');

async function testConnection() {
  // Handle encryption for Neo4j 4.0+
  const isEncrypted = NEO4J_URI.startsWith('neo4j://') || NEO4J_URI.startsWith('neo4j+s://');
  const driverConfig = isEncrypted 
    ? {
        encrypted: 'ENCRYPTION_ON',
        trust: 'TRUST_ALL_CERTIFICATES'
      }
    : {
        encrypted: 'ENCRYPTION_OFF'
      };
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    driverConfig
  );

  try {
    // First, try connecting to the default 'neo4j' database to test credentials
    console.log('Testing connection to default database first...');
    let session = driver.session({ database: 'neo4j' });
    try {
      const result = await session.run('RETURN 1 as test');
      console.log('✅ SUCCESS: Connected to Neo4j with these credentials!');
      console.log(`   Test query returned: ${result.records[0].get('test')}`);
      
      // Try to list databases
      try {
        const dbResult = await session.run('SHOW DATABASES');
        console.log('\n📊 Available databases:');
        dbResult.records.forEach(record => {
          const db = record.get('name');
          const current = record.get('current');
          console.log(`   ${current ? '→' : ' '} ${db}`);
        });
        
        // Check if the configured database exists
        const dbNames = dbResult.records.map(r => r.get('name'));
        if (NEO4J_DATABASE !== 'neo4j' && !dbNames.includes(NEO4J_DATABASE)) {
          console.log(`\n⚠️  WARNING: Database '${NEO4J_DATABASE}' not found!`);
          console.log(`   Available databases: ${dbNames.join(', ')}`);
          console.log(`   You may need to create it or use one of the available databases.`);
        }
      } catch (e) {
        // SHOW DATABASES might not be available in all Neo4j versions
        console.log('\n   (Could not list databases - this is OK)');
      }
      
      // Now try the configured database
      if (NEO4J_DATABASE !== 'neo4j') {
        console.log(`\nTesting connection to configured database: ${NEO4J_DATABASE}...`);
        await session.close();
        session = driver.session({ database: NEO4J_DATABASE });
        try {
          const dbTest = await session.run('RETURN 1 as test');
          console.log(`✅ SUCCESS: Can also connect to '${NEO4J_DATABASE}' database!`);
        } catch (dbErr) {
          console.log(`⚠️  WARNING: Cannot connect to '${NEO4J_DATABASE}' database`);
          console.log(`   Error: ${dbErr.message}`);
          console.log(`   The database might not exist. Try using 'neo4j' as the database name.`);
        }
      }
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error('❌ FAILED: Could not connect to Neo4j');
    console.error(`   Error: ${err.message}`);
    console.error(`   Code: ${err.code || 'N/A'}`);
    
    if (err.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('\n🔐 Authentication failed. The password is incorrect.');
      console.error('\nTo reset the Neo4j password:');
      console.error('1. Open Neo4j Browser (http://localhost:7474)');
      console.error('2. Try logging in with your current password');
      console.error('3. If that fails, use Neo4j Desktop to reset it:');
      console.error('   - Open Neo4j Desktop');
      console.error('   - Select your database');
      console.error('   - Click "..." menu → "Reset DBMS Password"');
      console.error('   - Or click "Open" → "Reset Password"');
      console.error('4. Update your .env file with the new password');
    } else if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
      console.error('\n🔌 Connection refused. Is Neo4j running?');
      console.error('   - Check if Neo4j Desktop/Server is running');
      console.error('   - Verify the URI is correct: ' + NEO4J_URI);
    }
  } finally {
    await driver.close();
  }
}

testConnection().catch(console.error);

