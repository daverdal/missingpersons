// newsModel.js
// Model and Neo4j queries for storing news items (emails, RSS, etc.)

const neo4j = require('neo4j-driver');

class NewsModel {
  constructor(driver, database = 'neo4j') {
    this.driver = driver;
    this.database = database;
  }

  /**
   * Upsert an array of news items.
   * Each item should contain at minimum: id, source, title, link, publishedAt, description.
   */
  async upsertMany(items) {
    if (!Array.isArray(items) || !items.length) return;
    const session = this.driver.session({ database: this.database });
    try {
      for (const item of items) {
        const params = {
          id: item.id,
          source: item.source || 'unknown',
          title: item.title || '',
          link: item.link || '',
          publishedAt: item.publishedAt || null,
          description: item.description || ''
        };
        if (!params.id) {
          // Skip items without a stable id
          // (id should typically be guid or link)
          // eslint-disable-next-line no-continue
          continue;
        }
        await session.run(
          `MERGE (n:NewsItem {id: $id})
           SET n.source = $source,
               n.title = $title,
               n.link = $link,
               n.publishedAt = $publishedAt,
               n.description = $description`,
          params
        );
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Find matches between applicant newsKeywords and NewsItem content.
   * Returns array of { newsItem, applicant, keyword }.
   */
  async findKeywordMatches(limit = 200) {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `
        MATCH (a:Applicant)
        WHERE a.newsKeywords IS NOT NULL AND size(a.newsKeywords) > 0
        UNWIND a.newsKeywords AS kwRaw
        WITH a, trim(toLower(kwRaw)) AS kw
        WHERE kw <> ''
        MATCH (n:NewsItem)
        WHERE toLower(coalesce(n.title, '') + ' ' + coalesce(n.description, '')) CONTAINS kw
        RETURN n, a, kw
        ORDER BY n.publishedAt DESC, n.title ASC
        LIMIT 200
        `
      );

      return result.records.map(record => {
        const n = record.get('n');
        const a = record.get('a');
        const kw = record.get('kw');
        return {
          newsItem: n ? n.properties : null,
          applicant: a ? a.properties : null,
          keyword: kw
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Find matches for a specific set of NewsItem ids that have not yet
   * been notified to the matching Applicants.
   * Returns array of { newsItem, applicant, keyword }.
   */
  async findUnnotifiedMatchesForNewsIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return [];
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `
        MATCH (n:NewsItem)
        WHERE n.id IN $ids
        MATCH (a:Applicant)
        WHERE a.newsKeywords IS NOT NULL AND size(a.newsKeywords) > 0
        UNWIND a.newsKeywords AS kwRaw
        WITH n, a, trim(toLower(kwRaw)) AS kw
        WHERE kw <> ''
          AND toLower(coalesce(n.title, '') + ' ' + coalesce(n.description, '')) CONTAINS kw
          AND NOT (n)-[:NOTIFIED_TO {keyword: kw}]->(a)
        RETURN n, a, kw
        `,
        { ids }
      );

      return result.records.map(record => {
        const n = record.get('n');
        const a = record.get('a');
        const kw = record.get('kw');
        return {
          newsItem: n ? n.properties : null,
          applicant: a ? a.properties : null,
          keyword: kw
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get all news items from the database.
   * Returns array of news item objects.
   */
  async getAll(limit = 1000) {
    const session = this.driver.session({ database: this.database });
    try {
      // Ensure limit is an integer (Neo4j requires INTEGER, not FLOAT)
      // Use neo4j.int() to create a proper Neo4j integer type
      const limitValue = Math.floor(Math.max(1, Math.min(parseInt(limit, 10) || 1000, 10000)));
      const limitInt = neo4j.int(limitValue);
      
      const result = await session.run(
        `
        MATCH (n:NewsItem)
        RETURN n
        ORDER BY 
          CASE WHEN n.publishedAt IS NULL THEN 1 ELSE 0 END,
          n.publishedAt DESC,
          coalesce(n.title, '') ASC
        LIMIT $limit
        `,
        { limit: limitInt }
      );

      return result.records.map(record => {
        const n = record.get('n');
        return n ? n.properties : null;
      }).filter(Boolean);
    } catch (err) {
      console.error('Error fetching all news items:', err);
      throw err;
    } finally {
      await session.close();
    }
  }

  /**
   * Mark a set of matches as notified by creating NOTIFIED_TO relationships.
   * matches: array of { newsItemId, applicantId, keyword }
   */
  async markMatchesNotified(matches) {
    if (!Array.isArray(matches) || !matches.length) return;
    const rows = matches
      .map(m => ({
        newsId: m.newsItemId,
        applicantId: m.applicantId,
        keyword: m.keyword
      }))
      .filter(row => row.newsId && row.applicantId && row.keyword);

    if (!rows.length) return;

    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MATCH (n:NewsItem {id: row.newsId})
        MATCH (a:Applicant {id: row.applicantId})
        MERGE (n)-[r:NOTIFIED_TO {keyword: row.keyword}]->(a)
        ON CREATE SET r.createdAt = datetime()
        `,
        { rows }
      );
    } finally {
      await session.close();
    }
  }
}

module.exports = NewsModel;


