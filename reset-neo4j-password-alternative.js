// Alternative method to reset Neo4j password using cypher-shell
// This script helps you reset the password if you can connect with the old password

require('dotenv').config();
const neo4j = require('neo4j-driver');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function resetPassword() {
  console.log('=== Neo4j Password Reset Helper ===\n');
  
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  
  console.log(`Connecting to: ${uri}`);
  console.log(`User: ${user}\n`);
  
  // Try to get current password
  const currentPassword = await question('Enter your CURRENT Neo4j password (or press Enter to try from .env): ');
  const passwordToTry = currentPassword.trim() || process.env.NEO4J_PASSWORD || '';
  
  if (!passwordToTry) {
    console.log('❌ No password provided. Exiting.');
    rl.close();
    return;
  }
  
  console.log('\nAttempting to connect...');
  // Handle encryption for Neo4j 4.0+
  const isEncrypted = uri.startsWith('neo4j://') || uri.startsWith('neo4j+s://');
  const driverConfig = {
    encrypted: isEncrypted ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
    trust: 'TRUST_ALL_CERTIFICATES'
  };
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, passwordToTry), driverConfig);
  
  try {
    const session = driver.session({ database: 'neo4j' });
    try {
      // Test connection
      await session.run('RETURN 1');
      console.log('✅ Connected successfully!\n');
      
      // Get new password
      const newPassword = await question('Enter your NEW password: ');
      const confirmPassword = await question('Confirm your NEW password: ');
      
      if (newPassword !== confirmPassword) {
        console.log('❌ Passwords do not match. Exiting.');
        rl.close();
        return;
      }
      
      if (newPassword.length < 8) {
        console.log('⚠️  Warning: Password is less than 8 characters. Neo4j may require longer passwords.');
      }
      
      // Change password
      console.log('\nChanging password...');
      await session.run(
        `ALTER CURRENT USER SET PASSWORD FROM $oldPassword TO $newPassword`,
        { oldPassword: passwordToTry, newPassword: newPassword }
      );
      
      console.log('✅ Password changed successfully!\n');
      console.log('Update your .env file with:');
      console.log(`NEO4J_PASSWORD=${newPassword}\n`);
      
    } catch (err) {
      if (err.code === 'Neo.ClientError.Security.Unauthorized') {
        console.log('❌ Current password is incorrect. Cannot reset.');
        console.log('\nYou need to reset the password using one of these methods:');
        console.log('1. Neo4j Desktop - Stop DB, then use Reset Password option');
        console.log('2. Command line - Stop Neo4j service, then reset');
        console.log('3. Check Neo4j Desktop settings for the password');
      } else {
        console.log(`❌ Error: ${err.message}`);
      }
    } finally {
      await session.close();
    }
  } catch (err) {
    console.log(`❌ Connection failed: ${err.message}`);
    console.log('\nThe current password appears to be incorrect.');
    console.log('You will need to reset it using Neo4j Desktop or command line methods.');
  } finally {
    await driver.close();
    rl.close();
  }
}

resetPassword().catch(console.error);

