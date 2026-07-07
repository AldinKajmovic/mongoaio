/**
 * Backend constants for the database layer.
 * @module db/constants
 */

/** @type {number} MongoDB connection timeout in milliseconds */
const CONNECTION_TIMEOUT_MS = 10000;

/** @type {number} Max time (ms) a single socket op may block before erroring.
 * Guards against idle-dropped sockets (NAT/firewall) that would otherwise hang forever. */
const SOCKET_TIMEOUT_MS = 60000;

/** @type {number} Retire pooled connections after this idle time (ms) so a fresh
 * socket is opened on next use instead of reusing a dead one. */
const MAX_IDLE_TIME_MS = 60000;

/** @type {number} Default document limit for queries and comparisons */
const DEFAULT_QUERY_LIMIT = 10;

/** @type {number} Max documents returned from a shell cursor before truncation */
const SHELL_RESULT_LIMIT = 1000;

/** @type {number} Documents fetched per page for server-paginated shell finds */
const SHELL_PAGE_SIZE = 10;

module.exports = {
  CONNECTION_TIMEOUT_MS,
  SOCKET_TIMEOUT_MS,
  MAX_IDLE_TIME_MS,
  DEFAULT_QUERY_LIMIT,
  SHELL_RESULT_LIMIT,
  SHELL_PAGE_SIZE,
};
