// Database setup script - Creates constraints, indexes, and optionally seeds data
// Run with: node setup-database.js [--seed] [--constraints-only]

require('dotenv').config();
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

const args = process.argv.slice(2);
const shouldSeed = args.includes('--seed');
const constraintsOnly = args.includes('--constraints-only');

async function setupDatabase() {
  console.log('=== Neo4j Database Setup ===\n');
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
    // Test connection
    await session.run('RETURN 1');
    console.log('✅ Connected to Neo4j successfully!\n');

    // 1. Create Constraints
    console.log('Creating database constraints...');
    const constraints = [
      // Note: Case constraint might fail if Case nodes don't exist - that's OK
      {
        name: 'case_id_unique',
        query: 'CREATE CONSTRAINT case_id_unique IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE',
        optional: true
      },
      {
        name: 'applicant_email_unique',
        query: 'CREATE CONSTRAINT applicant_email_unique IF NOT EXISTS FOR (a:Applicant) REQUIRE a.email IS UNIQUE',
        optional: false
      },
      {
        name: 'org_name_unique',
        query: 'CREATE CONSTRAINT org_name_unique IF NOT EXISTS FOR (o:Organization) REQUIRE o.name IS UNIQUE',
        optional: false
      },
      {
        name: 'community_name_unique',
        query: 'CREATE CONSTRAINT community_name_unique IF NOT EXISTS FOR (c:Community) REQUIRE c.name IS UNIQUE',
        optional: false
      },
      {
        name: 'user_email_unique',
        query: 'CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE',
        optional: false
      },
      {
        name: 'applicant_id_unique',
        query: 'CREATE CONSTRAINT applicant_id_unique IF NOT EXISTS FOR (a:Applicant) REQUIRE a.id IS UNIQUE',
        optional: false
      },
      {
        name: 'lovedone_id_unique',
        query: 'CREATE CONSTRAINT lovedone_id_unique IF NOT EXISTS FOR (l:LovedOne) REQUIRE l.id IS UNIQUE',
        optional: false
      }
    ];

    for (const constraint of constraints) {
      try {
        await session.run(constraint.query);
        console.log(`  ✅ Created constraint: ${constraint.name}`);
      } catch (err) {
        if (constraint.optional) {
          console.log(`  ⚠️  Skipped constraint: ${constraint.name} (${err.message})`);
        } else {
          console.log(`  ❌ Failed to create constraint: ${constraint.name}`);
          console.log(`     Error: ${err.message}`);
        }
      }
    }

    // 2. Create Indexes
    console.log('\nCreating indexes...');
    const indexes = [
      {
        name: 'audit_log_timestamp',
        query: 'CREATE INDEX audit_log_timestamp IF NOT EXISTS FOR (a:AuditLog) ON (a.timestamp)'
      },
      {
        name: 'audit_log_action',
        query: 'CREATE INDEX audit_log_action IF NOT EXISTS FOR (a:AuditLog) ON (a.action)'
      },
      {
        name: 'audit_log_resource',
        query: 'CREATE INDEX audit_log_resource IF NOT EXISTS FOR (a:AuditLog) ON (a.resourceId)'
      },
      {
        name: 'applicant_id_index',
        query: 'CREATE INDEX applicant_id_index IF NOT EXISTS FOR (a:Applicant) ON (a.id)'
      },
      {
        name: 'lovedone_community_index',
        query: 'CREATE INDEX lovedone_community_index IF NOT EXISTS FOR (l:LovedOne) ON (l.community)'
      },
      {
        name: 'lovedone_date_index',
        query: 'CREATE INDEX lovedone_date_index IF NOT EXISTS FOR (l:LovedOne) ON (l.dateOfIncident)'
      }
    ];

    for (const index of indexes) {
      try {
        await session.run(index.query);
        console.log(`  ✅ Created index: ${index.name}`);
      } catch (err) {
        console.log(`  ⚠️  Index creation: ${index.name} - ${err.message}`);
      }
    }

    if (constraintsOnly) {
      console.log('\n✅ Constraints and indexes created. Exiting (--constraints-only flag).');
      return;
    }

    // 3. Check if database has data
    console.log('\nChecking database contents...');
    const nodeCounts = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] AS label, count(n) AS count
      ORDER BY label
    `);

    const counts = {};
    nodeCounts.records.forEach(record => {
      const label = record.get('label');
      const count = record.get('count').toInt();
      counts[label] = count;
      console.log(`  ${label}: ${count} nodes`);
    });

    // 4. Seed data if requested or if database is empty
    const totalNodes = Object.values(counts).reduce((a, b) => a + b, 0);
    const hasCommunities = counts['Community'] > 0;
    const hasOrganizations = counts['Organization'] > 0;

    if (shouldSeed || totalNodes === 0) {
      console.log('\nSeeding database with initial data...');
      
      // Read and execute seed file
      const seedFilePath = path.join(__dirname, 'purge_and_seed.cypher');
      if (fs.existsSync(seedFilePath)) {
        const seedContent = fs.readFileSync(seedFilePath, 'utf8');
        const queries = seedContent
          .split(';')
          .map(q => q.trim())
          .filter(q => q && !q.split('\n').every(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('//') || trimmed === '';
          }));

        console.log(`  Found ${queries.length} seed statements`);
        
        for (let i = 0; i < queries.length; i++) {
          try {
            await session.run(queries[i]);
            if ((i + 1) % 10 === 0) {
              process.stdout.write(`  Progress: ${i + 1}/${queries.length}\r`);
            }
          } catch (err) {
            console.log(`\n  ⚠️  Warning on statement ${i + 1}: ${err.message}`);
            // Continue with other statements
          }
        }
        console.log(`\n  ✅ Seed data loaded (${queries.length} statements)`);
      } else {
        console.log('  ⚠️  Seed file not found: purge_and_seed.cypher');
      }
    } else if (!hasCommunities || !hasOrganizations) {
      console.log('\n⚠️  Database has some data but may be missing:');
      if (!hasCommunities) console.log('  - Communities (run with --seed to add them)');
      if (!hasOrganizations) console.log('  - Organizations (run with --seed to add them)');
    } else {
      console.log('\n✅ Database already has data. Use --seed to reload seed data.');
    }

    // 5. Verify setup
    console.log('\nVerifying setup...');
    const verifyResult = await session.run(`
      CALL db.constraints() YIELD name
      RETURN count(name) AS constraintCount
    `);
    const constraintCount = verifyResult.records[0].get('constraintCount').toInt();
    console.log(`  ✅ Found ${constraintCount} constraints`);

    const indexResult = await session.run(`
      CALL db.indexes() YIELD name
      RETURN count(name) AS indexCount
    `);
    const indexCount = indexResult.records[0].get('indexCount').toInt();
    console.log(`  ✅ Found ${indexCount} indexes`);

    console.log('\n✅ Database setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Start your server: npm start');
    console.log('2. Test the connection: node test-neo4j-connection.js');

  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    console.error('Error code:', err.code || 'N/A');
    if (err.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('\nAuthentication failed. Check your .env file credentials.');
    }
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

setupDatabase().catch(console.error);

