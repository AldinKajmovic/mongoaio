/**
 * Backend constants for the database layer.
 * @module db/constants
 */

/** @type {number} MongoDB connection timeout in milliseconds */
const CONNECTION_TIMEOUT_MS = 10000;

/** @type {number} Default document limit for queries and comparisons */
const DEFAULT_QUERY_LIMIT = 10;

module.exports = {
  CONNECTION_TIMEOUT_MS,
  DEFAULT_QUERY_LIMIT,
};
