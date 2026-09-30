/* =============================================
   Main Process — IPC Handler Wrapper
   ============================================= */

const { sanitizeErrorMessage } = require('./validate');
const { log, logError } = require('./logger');

/**
 * Wrap an IPC handler so a thrown error is logged in full (channel + stack, with
 * connection strings redacted) and handed back to the renderer with its stack,
 * instead of vanishing into a bare message.
 *
 * @param {string} channel - the IPC channel, used as the log scope
 * @param {(...args: any[]) => Promise<any>} fn
 */
function safeHandler(channel, fn) {
  return async (...args) => {
    // Argument *values* stay out of the log (documents and URLs are sensitive);
    // run with MONGOAIO_LOG_LEVEL=debug to trace which channels were called.
    log('debug', `ipc:${channel}`, 'invoked', { argc: Math.max(0, args.length - 1) });
    try {
      return await fn(...args);
    } catch (err) {
      const stack = logError(`ipc:${channel}`, err);
      return {
        error: sanitizeErrorMessage(err.message),
        channel,
        stack
      };
    }
  };
}

module.exports = { safeHandler };
