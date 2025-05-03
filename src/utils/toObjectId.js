// src/utils/toObjectId.js
const { Types } = require('mongoose');

/**
 * Convert a (possibly undefined) string to a valid ObjectId.
 * Returns `undefined` when nothing (or an invalid id) is supplied
 * so you can spread it safely into a $match condition.
 */
module.exports = (id) =>
    id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined;
