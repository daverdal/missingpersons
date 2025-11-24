// userModel.js
// User model and Neo4j queries for user management

const neo4j = require('neo4j-driver');
const bcrypt = require('bcryptjs');

class UserModel {
  constructor(driver) {
    this.driver = driver;
  }

  async getAllUsers() {
    const session = this.driver.session();
    try {
      const result = await session.run('MATCH (u:User) RETURN u');
      return result.records.map(r => r.get('u').properties);
    } finally {
      await session.close();
    }
  }

  async getUserByEmail(email) {
    const session = this.driver.session();
    try {
      const result = await session.run('MATCH (u:User {email: $email}) RETURN u', { email });
      if (result.records.length === 0) return null;
      return result.records[0].get('u').properties;
    } finally {
      await session.close();
    }
  }

  async createUser(user) {
    const session = this.driver.session();
    try {
      // Hash the password before storing
      const hash = await bcrypt.hash(user.password, 10);
      await session.run(
        'CREATE (u:User {id: $id, name: $name, email: $email, roles: $roles, password: $password})',
        { ...user, password: hash }
      );
      return { ...user, password: undefined };
    } finally {
      await session.close();
    }
  }

  async verifyUserPassword(email, password) {
    const session = this.driver.session();
    try {
      const result = await session.run('MATCH (u:User {email: $email}) RETURN u', { email });
      if (result.records.length === 0) return false;
      const user = result.records[0].get('u').properties;
  if (!user.password) return false;
  return await bcrypt.compare(password, user.password);
    } finally {
      await session.close();
    }
  }

  async updateUserRoles(email, roles) {
    const session = this.driver.session();
    try {
      await session.run(
        'MATCH (u:User {email: $email}) SET u.roles = $roles RETURN u',
        { email, roles }
      );
      return true;
    } finally {
      await session.close();
    }
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(email) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (u:User {email: $email}) RETURN u.preferences AS preferences',
        { email }
      );
      if (result.records.length === 0) return null;
      const prefsStr = result.records[0].get('preferences');
      if (!prefsStr) return {};
      try {
        return JSON.parse(prefsStr);
      } catch {
        return {};
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(email, preferences) {
    const session = this.driver.session();
    try {
      await session.run(
        'MATCH (u:User {email: $email}) SET u.preferences = $preferences RETURN u',
        { email, preferences: JSON.stringify(preferences || {}) }
      );
      return true;
    } finally {
      await session.close();
    }
  }
}

module.exports = UserModel;
