/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

const cfg = config.jobs = {};

cfg.queueOptions = {
  // if multiple instances of the same Bedrock module (e.g. bedrock-ledger-node)
  // are running on the same redis server, one *must* override this prefix in
  // the config in the top level application
  prefix: 'bedrock-jobs',

  // these options are passed directly to the `ioredis` redis client
  // any client options that `ioredis` supports may be configured here
  redis: {
    host: 'localhost',
    port: 6379,
  }
};
