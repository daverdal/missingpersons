// witnessModel.js
// Model and Neo4j queries for witness management

const { v4: uuidv4 } = require('uuid');

class WitnessModel {
  constructor(driver, database = 'neo4j') {
    this.driver = driver;
    this.database = database;
  }

  /**
   * Create a new witness
   * @param {object} witness - Witness data
   * @param {string} witness.name - Name of the witness
   * @param {string} [witness.contact] - Phone or email
   * @param {string} [witness.address] - Address
   * @param {string} [witness.statement] - Witness statement/notes
   * @param {string} [witness.dateOfStatement] - Date when statement was taken (ISO string)
   * @param {string} witness.createdBy - User who created the witness record
   * @param {string} [witness.relatedToType] - 'case' or 'lovedOne'
   * @param {string} [witness.relatedToId] - ID of related case or LovedOne
   * @param {string} [witness.reportedTo] - Email of caseworker who took the statement
   * @param {object} [witness.metadata] - Additional flexible data
   */
  async createWitness(witness) {
    const session = this.driver.session({ database: this.database });
    try {
      const witnessId = uuidv4();
      const params = {
        witnessId,
        name: witness.name || '',
        contact: witness.contact || null,
        address: witness.address || null,
        statement: witness.statement || null,
        dateOfStatement: witness.dateOfStatement || new Date().toISOString(),
        createdBy: witness.createdBy || 'system',
        relatedToType: witness.relatedToType || null,
        relatedToId: witness.relatedToId || null,
        reportedTo: witness.reportedTo || null,
        metadata: witness.metadata ? JSON.stringify(witness.metadata) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await session.run(
        `CREATE (w:Witness {
          witnessId: $witnessId,
          name: $name,
          contact: $contact,
          address: $address,
          statement: $statement,
          dateOfStatement: $dateOfStatement,
          createdBy: $createdBy,
          relatedToType: $relatedToType,
          relatedToId: $relatedToId,
          reportedTo: $reportedTo,
          metadata: $metadata,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        RETURN w`,
        params
      );

      // Link to case if provided
      if (witness.relatedToType === 'case' && witness.relatedToId) {
        await session.run(
          `MATCH (w:Witness {witnessId: $witnessId}), (a:Applicant {id: $caseId})
           CREATE (w)-[:WITNESSED]->(a)`,
          { witnessId, caseId: witness.relatedToId }
        );
      }

      // Link to LovedOne if provided
      if (witness.relatedToType === 'lovedOne' && witness.relatedToId) {
        await session.run(
          `MATCH (w:Witness {witnessId: $witnessId}), (l:LovedOne {id: $lovedOneId})
           CREATE (w)-[:WITNESSED]->(l)`,
          { witnessId, lovedOneId: witness.relatedToId }
        );
      }

      // Link to caseworker who took the statement
      if (witness.reportedTo) {
        await session.run(
          `MATCH (w:Witness {witnessId: $witnessId}), (u:User {email: $email})
           CREATE (w)-[:REPORTED_TO]->(u)`,
          { witnessId, email: witness.reportedTo }
        );
      }

      return {
        witnessId: params.witnessId,
        ...params,
        metadata: witness.metadata || null
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get all witnesses with optional filters
   * @param {object} filters - Filter options
   * @param {string} [filters.relatedToType] - Filter by related type
   * @param {string} [filters.relatedToId] - Filter by related ID
   * @param {string} [filters.reportedTo] - Filter by caseworker email
   * @param {string} [filters.createdBy] - Filter by creator
   */
  async getWitnesses(filters = {}) {
    const session = this.driver.session({ database: this.database });
    try {
      let query = `
        MATCH (w:Witness)
        OPTIONAL MATCH (w)-[:WITNESSED]->(a:Applicant)
        OPTIONAL MATCH (w)-[:WITNESSED]->(l:LovedOne)
        OPTIONAL MATCH (w)-[:REPORTED_TO]->(u:User)
        WHERE 1=1
      `;
      const params = {};

      if (filters.relatedToType) {
        query += ` AND w.relatedToType = $relatedToType`;
        params.relatedToType = filters.relatedToType;
      }

      if (filters.relatedToId) {
        query += ` AND w.relatedToId = $relatedToId`;
        params.relatedToId = filters.relatedToId;
      }

      if (filters.reportedTo) {
        query += ` AND w.reportedTo = $reportedTo`;
        params.reportedTo = filters.reportedTo;
      }

      if (filters.createdBy) {
        query += ` AND w.createdBy = $createdBy`;
        params.createdBy = filters.createdBy;
      }

      query += ` RETURN w, a, l, u ORDER BY w.dateOfStatement DESC, w.createdAt DESC`;

      const result = await session.run(query, params);
      return result.records.map(r => {
        const witness = r.get('w').properties;
        const applicant = r.get('a');
        const lovedOne = r.get('l');
        const user = r.get('u');
        
        return {
          ...witness,
          metadata: witness.metadata ? JSON.parse(witness.metadata) : null,
          relatedTo: applicant ? { type: 'case', name: applicant.properties.name, id: applicant.properties.id } :
                   lovedOne ? { type: 'lovedOne', name: lovedOne.properties.name, id: lovedOne.properties.id } :
                   null,
          reportedToUser: user ? { email: user.properties.email, name: user.properties.name } : null
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get witness by ID
   * @param {string} witnessId - Witness ID
   */
  async getWitnessById(witnessId) {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (w:Witness {witnessId: $witnessId})
         OPTIONAL MATCH (w)-[:WITNESSED]->(a:Applicant)
         OPTIONAL MATCH (w)-[:WITNESSED]->(l:LovedOne)
         OPTIONAL MATCH (w)-[:REPORTED_TO]->(u:User)
         RETURN w, a, l, u`,
        { witnessId }
      );

      if (result.records.length === 0) {
        return null;
      }

      const r = result.records[0];
      const witness = r.get('w').properties;
      const applicant = r.get('a');
      const lovedOne = r.get('l');
      const user = r.get('u');

      return {
        ...witness,
        metadata: witness.metadata ? JSON.parse(witness.metadata) : null,
        relatedTo: applicant ? { type: 'case', name: applicant.properties.name, id: applicant.properties.id } :
                 lovedOne ? { type: 'lovedOne', name: lovedOne.properties.name, id: lovedOne.properties.id } :
                 null,
        reportedToUser: user ? { email: user.properties.email, name: user.properties.name } : null
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Update a witness
   * @param {string} witnessId - Witness ID
   * @param {object} updates - Fields to update
   */
  async updateWitness(witnessId, updates) {
    const session = this.driver.session({ database: this.database });
    try {
      const setClauses = [];
      const params = { witnessId };

      if (updates.name !== undefined) {
        setClauses.push('w.name = $name');
        params.name = updates.name;
      }

      if (updates.contact !== undefined) {
        setClauses.push('w.contact = $contact');
        params.contact = updates.contact;
      }

      if (updates.address !== undefined) {
        setClauses.push('w.address = $address');
        params.address = updates.address;
      }

      if (updates.statement !== undefined) {
        setClauses.push('w.statement = $statement');
        params.statement = updates.statement;
      }

      if (updates.dateOfStatement !== undefined) {
        setClauses.push('w.dateOfStatement = $dateOfStatement');
        params.dateOfStatement = updates.dateOfStatement;
      }

      if (updates.relatedToType !== undefined) {
        setClauses.push('w.relatedToType = $relatedToType');
        params.relatedToType = updates.relatedToType;
      }

      if (updates.relatedToId !== undefined) {
        setClauses.push('w.relatedToId = $relatedToId');
        params.relatedToId = updates.relatedToId;
      }

      if (updates.reportedTo !== undefined) {
        setClauses.push('w.reportedTo = $reportedTo');
        params.reportedTo = updates.reportedTo;
      }

      if (updates.metadata !== undefined) {
        setClauses.push('w.metadata = $metadata');
        params.metadata = updates.metadata ? JSON.stringify(updates.metadata) : null;
      }

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      setClauses.push('w.updatedAt = $updatedAt');
      params.updatedAt = new Date().toISOString();

      await session.run(
        `MATCH (w:Witness {witnessId: $witnessId})
         SET ${setClauses.join(', ')}
         RETURN w`,
        params
      );

      // Update relationships if needed
      if (updates.relatedToType !== undefined || updates.relatedToId !== undefined) {
        // Remove old relationships
        await session.run(
          `MATCH (w:Witness {witnessId: $witnessId})-[rel:WITNESSED]->()
           DELETE rel`,
          { witnessId }
        );

        // Create new relationship
        if (updates.relatedToType === 'case' && updates.relatedToId) {
          await session.run(
            `MATCH (w:Witness {witnessId: $witnessId}), (a:Applicant {id: $caseId})
             CREATE (w)-[:WITNESSED]->(a)`,
            { witnessId, caseId: updates.relatedToId }
          );
        } else if (updates.relatedToType === 'lovedOne' && updates.relatedToId) {
          await session.run(
            `MATCH (w:Witness {witnessId: $witnessId}), (l:LovedOne {id: $lovedOneId})
             CREATE (w)-[:WITNESSED]->(l)`,
            { witnessId, lovedOneId: updates.relatedToId }
          );
        }
      }

      if (updates.reportedTo !== undefined) {
        // Remove old relationship
        await session.run(
          `MATCH (w:Witness {witnessId: $witnessId})-[rel:REPORTED_TO]->()
           DELETE rel`,
          { witnessId }
        );

        // Create new relationship
        if (updates.reportedTo) {
          await session.run(
            `MATCH (w:Witness {witnessId: $witnessId}), (u:User {email: $email})
             CREATE (w)-[:REPORTED_TO]->(u)`,
            { witnessId, email: updates.reportedTo }
          );
        }
      }

      return await this.getWitnessById(witnessId);
    } finally {
      await session.close();
    }
  }

  /**
   * Delete a witness
   * @param {string} witnessId - Witness ID
   */
  async deleteWitness(witnessId) {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `MATCH (w:Witness {witnessId: $witnessId})
         DETACH DELETE w`,
        { witnessId }
      );
    } finally {
      await session.close();
    }
  }
}

module.exports = WitnessModel;

