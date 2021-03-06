/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');
const Queue = require('bull');

require('./config');

/**
 * @module bedrock-jobs
 */

/**
 * Creates a new Bull Queue that is persisted in Redis. Every time a queue
 * with the same name is instantiated it tries to process all the old
 * jobs that may exist from a previous unfinished session.
 *
 * @param {Object} options - The options to use.
 * @param {string} options.name - The name for the queue.
 * @param {QueueOptions} [options.queueOptions = {}] - The Bull QueueOptions.
 *
 * @returns {Queue} A Bull Queue.
 */
exports.addQueue = ({name, queueOptions = {}}) => {
  // apply the redis options from the config
  const options = Object.assign({}, config.jobs.queueOptions, queueOptions);
  return new Queue(name, options);
};

/**
 * Bull QueueOptions.
 * @typedef {Object} QueueOptions
 * @link https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queue
 */
