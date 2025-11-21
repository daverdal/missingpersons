// Script to help find or reset Neo4j password
// This will try multiple methods to help you access Neo4j

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

async function tryCommonPasswords() {
  console.log('=== Trying Common Neo4j Passwords ===\n');
  
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  
  // Common default passwords
  const commonPasswords = [
    'neo4j',
    'password',
    'admin',
    '123456',
    'neo4j123',
    'password123',
    process.env.NEO4J_PASSWORD // Also try the one from .env
  ].filter((p, i, arr) => p && arr.indexOf(p) === i); // Remove duplicates
  
  console.log(`Trying to connect to: ${uri}`);
  console.log(`User: ${user}\n`);
  console.log('Testing common passwords...\n');
  
  for (const password of commonPasswords) {
    if (!password) continue;
    
    // Handle encryption for Neo4j 4.0+
    const isEncrypted = uri.startsWith('neo4j://') || uri.startsWith('neo4j+s://');
    const driverConfig = {
      encrypted: isEncrypted ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
      trust: 'TRUST_ALL_CERTIFICATES'
    };
    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), driverConfig);
    try {
      const session = driver.session({ database: 'neo4j' });
      try {
        await session.run('RETURN 1');
        console.log(`✅ SUCCESS! Password found: "${password}"\n`);
        console.log('Update your .env file with:');
        console.log(`NEO4J_PASSWORD=${password}\n`);
        
        // Ask if they want to change it
        const change = await question('Do you want to change this password? (y/n): ');
        if (change.toLowerCase() === 'y') {
          const newPassword = await question('Enter new password: ');
          const confirm = await question('Confirm new password: ');
          
          if (newPassword === confirm) {
            await session.run(
              `ALTER CURRENT USER SET PASSWORD FROM $old TO $new`,
              { old: password, new: newPassword }
            );
            console.log('\n✅ Password changed successfully!');
            console.log('Update your .env file with:');
            console.log(`NEO4J_PASSWORD=${newPassword}\n`);
          } else {
            console.log('Passwords do not match. Password not changed.');
          }
        }
        
        await session.close();
        await driver.close();
        rl.close();
        return;
      } catch (err) {
        // Wrong password, continue
      } finally {
        await session.close();
      }
      await driver.close();
    } catch (err) {
      // Connection error, continue
    }
    
    process.stdout.write('.');
  }
  
  console.log('\n\n❌ None of the common passwords worked.\n');
  console.log('Alternative methods:');
  console.log('1. Check Neo4j Desktop - Right-click database → "Open Folder" → look for config files');
  console.log('2. Check Neo4j Desktop - Look in "Details" panel for password field');
  console.log('3. Try accessing Neo4j Browser at http://localhost:7474');
  console.log('4. Check if Neo4j Desktop shows the password in the connection string');
  console.log('5. You may need to completely reset Neo4j (delete auth file)');
  
  rl.close();
}

tryCommonPasswords().catch(console.error);

