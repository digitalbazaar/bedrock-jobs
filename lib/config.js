/*
 * Bedrock job scheduler configuration
 *
 * Copyright (c) 2012-2015 Digital Bazaar, Inc. All rights reserved.
 */
var config = require('bedrock').config;

config.scheduler = {};
// number of concurrent jobs possible (not including immediate jobs)
config.scheduler.concurrency = 5;
// job type lock duration default: 1 minute
config.scheduler.lockDuration = 1000 * 60;
// job defaults
config.scheduler.defaults = {
  priority: 0,
  concurrency: 1
};
// idleTime in milliseconds
config.scheduler.idleTime = 1000 * 30;
// jobs to insert at start up
config.scheduler.jobs = [];
