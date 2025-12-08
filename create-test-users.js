// Script to create test users in the new database
// Run with: node create-test-users.js

require('dotenv').config();
const neo4j = require('neo4j-driver');
const bcrypt = require('bcryptjs');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

// Test users from login screen
const testUsers = [
  { id: 'admin1', name: 'Admin User', email: 'admin1@example.com', roles: ['admin'] },
  { id: 'cw1', name: 'Case Worker 1', email: 'caseworker1@example.com', roles: ['case_worker'] },
  { id: 'cw2', name: 'Case Worker 2', email: 'caseworker2@example.com', roles: ['case_worker'] },
  { id: 'cw3', name: 'Case Worker 3', email: 'caseworker3@example.com', roles: ['case_worker'] },
  { id: 'user1', name: 'Staff User 1', email: 'user1@example.com', roles: ['case_worker'] }
];

// All users use password 'admin'
const PASSWORD = 'admin';

async function createUsers() {
  console.log('=== Creating Test Users ===\n');
  console.log(`Connecting to: ${NEO4J_URI}`);
  console.log(`Database: ${NEO4J_DATABASE}`);
  console.log(`User: ${NEO4J_USER}\n`);

  // Handle encryption for Neo4j 4.0+
  const isEncrypted = NEO4J_URI.startsWith('neo4j://') || NEO4J_URI.startsWith('neo4j+s://');
  const driverConfig = {
    encrypted: isEncrypted ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
    trust: 'TRUST_ALL_CERTIFICATES'
  };

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    driverConfig
  );

  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    // Hash the password once for all users
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    console.log('Password hash generated\n');

    for (const user of testUsers) {
      try {
        // Check if user already exists
        const existing = await session.run(
          'MATCH (u:User {email: $email}) RETURN u',
          { email: user.email }
        );

        if (existing.records.length > 0) {
          console.log(`⚠️  User ${user.email} already exists, skipping...`);
          continue;
        }

        // Create the user
        await session.run(
          'CREATE (u:User {id: $id, name: $name, email: $email, roles: $roles, password: $password})',
          {
            id: user.id,
            name: user.name,
            email: user.email,
            roles: user.roles,
            password: hashedPassword
          }
        );

        console.log(`✅ Created user: ${user.email} (${user.roles.join(', ')})`);
      } catch (err) {
        console.error(`❌ Error creating user ${user.email}:`, err.message);
      }
    }

    console.log('\n=== Done ===');
    console.log('\nYou can now login with any of these accounts:');
    testUsers.forEach(u => {
      console.log(`  ${u.email} / ${PASSWORD}`);
    });
  } catch (err) {
    console.error('❌ Failed to create users:', err.message);
    if (err.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('\n🔐 Authentication failed. Check your NEO4J_PASSWORD in .env file.');
    } else if (err.message && err.message.includes('Database does not exist')) {
      console.error(`\n📊 Database '${NEO4J_DATABASE}' does not exist.`);
      console.error('   Please create it in Neo4j Desktop first.');
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

createUsers().catch(console.error);

