const neo4j = require('neo4j-driver');
require('dotenv').config();

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function purgeAndRecreateOrganizations() {
  let session = driver.session({ database: NEO4J_DATABASE });
  
  try {
    console.log('Purging existing organizations and their relationships...');
    
    // Delete all relationships connected to organizations
    await session.run('MATCH (o:Organization)-[r]-() DELETE r');
    console.log('Deleted organization relationships');
    
    // Delete all organizations
    await session.run('MATCH (o:Organization) DELETE o');
    console.log('Deleted all organizations');
    
    await session.close();
    
    // Recreate organizations with IDs
    console.log('Recreating organizations with IDs...');
    session = driver.session({ database: NEO4J_DATABASE });
    
    const organizations = [
      {
        name: 'Manitoba Association of Friendship Centres',
        type: 'Non-Profit',
        address: '200-141 Bannatyne Ave, Winnipeg, MB',
        phone: '204-942-6299',
        website: 'https://friendshipcentres.ca',
        active: true
      },
      {
        name: 'Ma Mawi Wi Chi Itata Centre',
        type: 'Indigenous Family Services',
        address: '445 King St, Winnipeg, MB',
        phone: '204-925-0300',
        website: 'https://www.mamawi.com',
        active: true
      },
      {
        name: 'Ka Ni Kanichihk',
        type: 'Indigenous Services',
        address: '455 McDermot Ave, Winnipeg, MB',
        phone: '204-953-5820',
        website: 'https://www.kanikanichihk.ca',
        active: true
      },
      {
        name: 'Manitoba Keewatinowi Okimakanak',
        type: 'First Nations Advocacy',
        address: '160-3553 Portage Ave, Winnipeg, MB',
        phone: '204-927-7500',
        website: 'https://mkonation.com',
        active: true
      },
      {
        name: 'Southern Chiefs\' Organization',
        type: 'First Nations Advocacy',
        address: '1572 Dublin Ave, Winnipeg, MB',
        phone: '204-946-1869',
        website: 'https://scoinc.mb.ca',
        active: true
      },
      {
        name: 'Missing and Murdered Indigenous Women and Girls Manitoba',
        type: 'Advocacy',
        address: '123 Main St, Winnipeg, MB',
        phone: '204-555-1234',
        website: 'https://mmiwg-mb.ca',
        active: true
      },
      {
        name: 'Prairie Hope Outreach',
        type: 'Outreach',
        address: '789 Portage Ave, Winnipeg, MB',
        phone: '204-555-5678',
        website: 'https://prairiehope.org',
        active: true
      },
      {
        name: 'Red River Support Services',
        type: 'Support Services',
        address: '321 Broadway, Winnipeg, MB',
        phone: '204-555-8765',
        website: 'https://redriversupport.ca',
        active: true
      }
    ];
    
    for (const org of organizations) {
      const orgId = `ORG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await session.run(
        `CREATE (o:Organization {
          id: $id,
          name: $name,
          type: $type,
          address: $address,
          phone: $phone,
          website: $website,
          active: $active
        })`,
        { ...org, id: orgId }
      );
      console.log(`Created organization: ${org.name} (ID: ${orgId})`);
    }
    
    console.log('Successfully recreated all organizations with IDs!');
    
  } catch (err) {
    if (err.message && err.message.includes('Database does not exist')) {
      console.log(`Database '${NEO4J_DATABASE}' does not exist. Trying 'neo4j' instead...`);
      await session.close();
      session = driver.session({ database: 'neo4j' });
      
      // Retry the operations
      await session.run('MATCH (o:Organization)-[r]-() DELETE r');
      await session.run('MATCH (o:Organization) DELETE o');
      
      const organizations = [
        {
          name: 'Manitoba Association of Friendship Centres',
          type: 'Non-Profit',
          address: '200-141 Bannatyne Ave, Winnipeg, MB',
          phone: '204-942-6299',
          website: 'https://friendshipcentres.ca',
          active: true
        },
        {
          name: 'Ma Mawi Wi Chi Itata Centre',
          type: 'Indigenous Family Services',
          address: '445 King St, Winnipeg, MB',
          phone: '204-925-0300',
          website: 'https://www.mamawi.com',
          active: true
        },
        {
          name: 'Ka Ni Kanichihk',
          type: 'Indigenous Services',
          address: '455 McDermot Ave, Winnipeg, MB',
          phone: '204-953-5820',
          website: 'https://www.kanikanichihk.ca',
          active: true
        },
        {
          name: 'Manitoba Keewatinowi Okimakanak',
          type: 'First Nations Advocacy',
          address: '160-3553 Portage Ave, Winnipeg, MB',
          phone: '204-927-7500',
          website: 'https://mkonation.com',
          active: true
        },
        {
          name: 'Southern Chiefs\' Organization',
          type: 'First Nations Advocacy',
          address: '1572 Dublin Ave, Winnipeg, MB',
          phone: '204-946-1869',
          website: 'https://scoinc.mb.ca',
          active: true
        },
        {
          name: 'Missing and Murdered Indigenous Women and Girls Manitoba',
          type: 'Advocacy',
          address: '123 Main St, Winnipeg, MB',
          phone: '204-555-1234',
          website: 'https://mmiwg-mb.ca',
          active: true
        },
        {
          name: 'Prairie Hope Outreach',
          type: 'Outreach',
          address: '789 Portage Ave, Winnipeg, MB',
          phone: '204-555-5678',
          website: 'https://prairiehope.org',
          active: true
        },
        {
          name: 'Red River Support Services',
          type: 'Support Services',
          address: '321 Broadway, Winnipeg, MB',
          phone: '204-555-8765',
          website: 'https://redriversupport.ca',
          active: true
        }
      ];
      
      for (const org of organizations) {
        const orgId = `ORG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await session.run(
          `CREATE (o:Organization {
            id: $id,
            name: $name,
            type: $type,
            address: $address,
            phone: $phone,
            website: $website,
            active: $active
          })`,
          { ...org, id: orgId }
        );
        console.log(`Created organization: ${org.name} (ID: ${orgId})`);
      }
      
      console.log('Successfully recreated all organizations with IDs!');
    } else {
      console.error('Error:', err);
      process.exitCode = 1;
    }
  } finally {
    if (session) await session.close();
    await driver.close();
  }
}

purgeAndRecreateOrganizations();

