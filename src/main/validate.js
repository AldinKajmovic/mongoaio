const VALID_SIDES = ['source', 'target'];

function validateSide(side) {
  if (!VALID_SIDES.includes(side)) {
    throw new Error('Invalid side parameter. Must be "source" or "target".');
  }
  return side;
}

function validateString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${name}: must be a non-empty string.`);
  }
  return value.trim();
}

function validateObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${name}: must be a plain object.`);
  }
  return value;
}

function validateOptions(value, name) {
  if (value === undefined || value === null) return {};
  return validateObject(value, name);
}

function validateConnectionUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('Invalid connection URL: must be a non-empty string.');
  }
  return url.trim();
}

function validateDocId(docId) {
  if (docId === undefined || docId === null || docId === '') {
    throw new Error('Invalid document ID: must not be empty.');
  }
  return docId;
}


function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') return 'An unknown error occurred.';
  // Replace MongoDB connection strings from error messages
  return message.replace(/mongodb(\+srv)?:\/\/[^\s,)}\]]+/gi, 'mongodb://***');
}

module.exports = {
  validateSide,
  validateString,
  validateObject,
  validateOptions,
  validateConnectionUrl,
  validateDocId,
  sanitizeErrorMessage,
};
