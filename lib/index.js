/*
 * Bedrock job scheduler module.
 *
 * Copyright (c) 2012-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const crypto = require('crypto');
const database = require('bedrock-mongodb');
const moment = require('moment-interval');
const uuid = require('uuid/v4');
const {BedrockError} = bedrock.util;

// load config defaults
require('./config');

// constants
const EVENT_SCAN = 'bedrock.Job.scan';

// module API
const api = {};
module.exports = api;

// distributed ID generator
let jobIdGenerator = null;

// defined job types
const jobTypes = {};

const logger = bedrock.loggers.get('app').child('jobs');

// TODO: abstract so database-backend can be switched?

bedrock.events.on('bedrock-mongodb.ready', init);

function init(callback) {
  // do initialization work
  async.waterfall([
    // open all necessary collections
    callback => database.openCollections(['job'], callback),
    // setup collections (create indexes, etc)
    callback => database.createIndexes([{
      collection: 'job',
      fields: {id: 1},
      options: {unique: true, background: false}
    }, {
      collection: 'job',
      fields: {type: 1, id: 1},
      options: {unique: true, background: false}
    }, {
      // TODO: is this index the most optimal for job searches?
      collection: 'job',
      fields: {
        due: 1,
        'job.priority': 1,
        type: 1,
        permits: 1,
        workers: 1,
        id: 1
      },
      options: {unique: true, background: false}
    }], callback),
    callback => database.getDistributedIdGenerator(
      'job', (err, idGenerator) => {
        if(!err) {
          jobIdGenerator = idGenerator;
        }
        callback(err);
      }),
    // create jobs, ignoring duplicate errors
    callback => async.eachSeries(
      bedrock.config.scheduler.jobs, (job, callback) => api.schedule(
        job, err => {
          if(err && database.isDuplicateError(err)) {
            err = null;
          }
          callback(err);
        }), callback),
    callback => {
      // add listener for scan events
      logger.verbose('register job scan listener');
      bedrock.events.on(EVENT_SCAN, event => {
        logger.verbose('got job scan event', event);
        const options = {};
        if(event && event.details) {
          if(event.details.jobId) {
            options.id = event.details.jobId;
          } else {
            options.reschedule = bedrock.config.scheduler.idleTime;
          }
          process.nextTick(() => _runWorker(options));
        }
      });
      callback();
    }
  ], callback);
}

bedrock.events.on('bedrock.ready', () => {
  // run up to 'concurrency' concurrent jobs
  for(let i = 0; i < bedrock.config.scheduler.concurrency; ++i) {
    logger.verbose('emit initial scan event');
    bedrock.events.emitLater({type: EVENT_SCAN, details: {}});
  }
});

/**
 * Defines a new job type. Scheduled jobs will only be processed if their
 * types have been defined. A job type specifies:
 *
 * 1. the function that will be run to process a job of that type,
 * 2. how many workers can run a job of that type at the same time (i.e. the
 *    total number of work permits for the job type),
 * 3. how long a particular worker that is running a job of that type
 *   may run before being considered expired, forcibly releasing its permit
 *   to allow another worker to work on the job
 *
 * Note that, due to current implementation limitations, lock duration can
 * only be configured on a per-job-type basis, it cannot be configured
 * per-job.
 *
 * @param type the unique type of job.
 * @param options the options to use:
 *          [lockDuration] how long a worker for a job of this type may
 *            execute before its permit is forcibly released, thereby
 *            permitting another worker to execute the job.
 *          [defaults] default job values to use.
 *            [schedule] how often to run the job.
 *            [priority] a number indicating priority, 0 for default, negative
 *              for low, positive for high.
 *            [concurrency] the number of workers that can concurrently work on
 *              a job, -1 for unlimited.
 * @param fn(job, callback) the function to call to execute the job.
 */
api.define = (type, options, fn) => {
  logger.info(`defining job type: ${type}`);
  if(typeof options === 'function') {
    fn = options;
    options = {};
  }
  jobTypes[type] = bedrock.util.extend(true, {
    lockDuration: bedrock.config.scheduler.lockDuration,
    defaults: bedrock.config.scheduler.defaults,
    fn
  }, options || {});
};

/**
 * Creates a new job ID.
 *
 * @param callback(err, id) called once the operation completes.
 */
api.generateJobId = callback => {
  jobIdGenerator.generateId((err, id) => {
    if(err) {
      return callback(err);
    }
    callback(null, id);
  });
};

/**
 * Schedules a new job. The job must have a type set. It may specify
 * a unique id, if it does not, one will be generated. It may also specify
 * how often to run the job and any job-specific data. Jobs may be scheduled
 * that do not have defined types, however, they will never be executed by this
 * particular scheduler (other schedulers may execute them).
 *
 * @param job the job to schedule.
 * @param options the options to use.
 *          [immediate] true to run the job immediately if its schedule permits.
 * @param callback(err, record) called once the operation completes.
 */
api.schedule = (job, options, callback) => {
  if(typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  if(!job.type) {
    return callback(new BedrockError(
      'Could not schedule job; no job type was specified.',
      'InvalidJob'));
  }

  async.waterfall([
    callback => {
      if(!job.id) {
        return api.generateJobId(callback);
      }
      callback(null, job.id);
    },
    (id, callback) => {
      job.id = id;

      // include any defaults
      let defaults = bedrock.config.scheduler.defaults;
      if(job.type in jobTypes) {
        defaults = bedrock.util.extend(
          true, {}, defaults, jobTypes[job.type].defaults);
      }
      job = bedrock.util.extend(true, {}, defaults, job);

      logger.info('scheduling job', job);

      // insert the job
      const now = Date.now();
      const due = _getNextJobSchedule(job);
      const record = {
        id: database.hash(job.id),
        meta: {
          created: now,
          updated: now
        },
        job,
        due,
        completed: null,
        permits: job.concurrency,
        workers: []
      };
      database.collections.job.insert(
        record, database.writeOptions, (err, result) => {
          if(err) {
            return callback(err);
          }
          if(options.immediate && due <= now) {
            // fire off worker
            _runWorker({id: job.id, type: job.type});
          }
          callback(null, result.ops[0]);
        });
    }
  ], callback);
};

/**
 * Unschedules a job or all jobs of a certain type.
 *
 * @param options the options to use.
 *          [id] the id of the job to unschedule.
 *          [type] the type of jobs to unschedule.
 * @param callback(err) called once the operation completes.
 */
api.unschedule = (options, callback) => {
  if(!(options.id || options.type)) {
    return callback(new BedrockError(
      'Could not remove job(s); no job id and/or type was specified.',
      'InvalidArguments'));
  }
  const query = {};
  if(options.id) {
    query.id = database.hash(options.id);
  }
  if(options.type) {
    query['job.type'] = options.type;
  }
  database.collections.job.remove(query, database.writeOptions, callback);
};

/**
 * Gets a job by its id.
 *
 * @param id the id of the job to retrieve.
 * @param callback(err, job, meta) called once the operation completes.
 */
api.getJob = (id, callback) => {
  async.waterfall([
    callback => database.collections.job.findOne(
      {id: database.hash(id)}, {}, callback),
    (record, callback) => {
      if(!record) {
        return callback(new BedrockError('Job not found.', 'NotFound', {id}));
      }
      callback(null, record.job, record.meta);
    }
  ], callback);
};

/**
 * Creates a worker ID. A worker ID is 40 hex digits long, consisting of a
 * start time (16 hex digits) concatenated with 24 random digits.
 *
 * @return the worker ID.
 */
api.createWorkerId = () => {
  // generate worker ID (16 hex start time + 24 hex random)
  let st = Date.now().toString(16);
  while(st.length < 16) {
    st = '0' + st;
  }
  const md = crypto.createHash('sha1');
  md.update(uuid());
  return st + md.digest('hex').substr(0, 24);
};

/**
 * Encodes an expired date as a worker ID (16 hex digit time + 24 zeros).
 *
 * @param expired the expired date (as ms since epoch) to encode.
 *
 * @return the 'expired' worker ID.
 */
api.encodeExpiredDate = expired => {
  expired = expired.toString(16);
  while(expired.length < 16) {
    expired = '0' + expired;
  }
  return expired + '000000000000000000000000';
};

/**
 * Gets the next time to run a job and updates the job schedule as appropriate.
 *
 * @param job the job.
 * @param [options] the options to use:
 *          [update] true to update the job schedule (assumes one job has
 *            completed).
 *
 * @return the next time to run the job.
 */
function _getNextJobSchedule(job, options) {
  options = options || {};

  if(!job.schedule) {
    job.schedule = bedrock.util.w3cDate();
  }

  const intervalParts = job.schedule.split('/');
  if(intervalParts.length === 1) {
    // do not schedule job again
    if(options.update) {
      return null;
    }
    // one-time scheduling
    return new Date(job.schedule);
  }

  let interval;
  if(intervalParts.length === 2) {
    // R[n]/duration
    interval = moment.interval(
      moment(), moment.interval(intervalParts[1]).period());
  } else {
    // R[n]/startDate/duration
    interval = moment.interval(intervalParts.slice(1).join('/'));
    // always use 'now' as start date if updating to a new schedule
    // to prevent rescheduling in the past which will just cause an
    // infinite loop until the job schedule catches up
    if(options.update) {
      interval = moment.interval(moment(), interval.period());
    }
  }

  let repeats = -1;
  if(intervalParts[0].length > 1) {
    // get specific number of repeats
    repeats = parseInt(intervalParts[0].substr(1), 10) || 0;
  }

  // next due date for job
  let due;
  if(options.update) {
    due = interval.end().toDate();
    // rewrite schedule
    if(repeats === 1) {
      // only one repeat (which just occurred) so do final scheduling
      job.schedule = bedrock.util.w3cDate(due);
    } else {
      job.schedule = 'R';
      if(repeats !== -1) {
        job.schedule += repeats;
      }
      job.schedule +=
        ['', interval.end().toISOString(), interval.period().toISOString()]
          .join('/');
    }
  } else {
    due = interval.start().toDate();
  }

  return due;
}

/**
 * Runs a worker execute scheduled jobs.
 *
 * @param options the options to use:
 *          id an optional job ID to specifically work on.
 * @param callback(err) called once the operation completes.
 */
function _runWorker(options, callback) {
  callback = callback || function() {};

  // get new worker ID and time
  const workerId = api.createWorkerId();
  const now = new Date();

  logger.verbose(
    'running job worker (' + workerId + ') to execute scheduled job' +
    (options.id ? (' "' + options.id + '"') : 's') + '...');

  // single update and new record retrieval db write options
  const singleUpdate = bedrock.util.extend(
    {}, database.writeOptions, {upsert: false, multi: false});

  // run algorithm on all matching entries
  let done = false;
  async.until(() => done, loopCallback => {
    /* Note: A worker will continue to run as long as it can mark a job to
    be executed. The query it will use will be for a specific job (if an ID is
    given) or for any job that meets the following criteria: it is due to be
    scheduled, it has a supported job type, it has a permit or an expired
    worker ID, and it has maximum priority of other jobs that meet the same
    criteria. */

    // implementation uses two queries: first looks for a job with an
    // available permit, if not found, second looks for a job with an
    // expired worker

    // build query to mark jobs that are scheduled to run now
    const baseQuery = {due: {$lte: now}};

    // mark job with max priority
    const queryOptions = {sort: {'job.priority': 1}};

    // mark specific job
    if(options.id) {
      baseQuery.id = database.hash(options.id);
    }

    async.auto({
      getIdleJob: callback => {
        // if no supported job types, skip
        if(Object.keys(jobTypes).length === 0) {
          return callback(null, 0);
        }
        // only mark jobs with supported types and an available permit
        const query = bedrock.util.extend({}, baseQuery, {
          'job.type': {$in: Object.keys(jobTypes)},
          permits: {$ne: 0},
          workers: {$ne: workerId}
        });
        database.collections.job.findOne(query, {}, queryOptions, callback);
      },
      getExpiredJob: ['getIdleJob', (results, callback) => {
        // idle job or no supported job types
        if(results.getIdleJob || Object.keys(jobTypes).length === 0) {
          return callback(null, null);
        }
        // build supported job type + lock duration options
        const query = bedrock.util.extend({}, baseQuery, {permits: 0, $or: []});
        for(const type in jobTypes) {
          // lock duration is used to indicate when to override a worker
          let expired = now.getTime() - jobTypes[type].lockDuration;
          expired = api.encodeExpiredDate(expired);
          query.$or.push(
            {'job.type': type, workers: {$lte: expired, $ne: workerId}});
        }
        database.collections.job.findOne(query, {}, queryOptions, callback);
      }],
      markJob: ['getExpiredJob', (results, callback) => {
        // if no job was found, skip update
        if(!results.getIdleJob && !results.getExpiredJob) {
          if(options.id) {
            // error when job isn't found and a specific ID was given
            return callback(new BedrockError(
              'Job not found, has undefined type, or is already in progress.',
              'NotFound', {id: options.id}));
          }
          // done, no matching jobs remain
          done = true;
          return loopCallback();
        }

        // prepare update
        const record = results.getIdleJob || results.getExpiredJob;
        const update = {$set: {'meta.updated': Date.now()}};

        // TODO: would be nice to do a pull here that also affects the
        // number of permits ... or, if the number of permits is -1,
        // do the pull without having to deal with permits or handling
        // worker IDs in memory (as this may not scale) ... there are
        // limitations with current mongo w/doing a pull and a push in
        // the same update

        // prune any expired workers, update permits, add new worker ID
        let expired = now.getTime() - jobTypes[record.job.type].lockDuration;
        expired = api.encodeExpiredDate(expired);
        update.$set.workers = record.workers.filter(worker => worker > expired);
        update.$set.workers.push(workerId);
        // if permits not unlimited, update count
        if(record.permits >= 0) {
          update.$set.permits = (record.permits +
            record.workers.length - update.$set.workers.length);
        }
        database.collections.job.update({
          id: record.id,
          permits: record.permits,
          workers: record.workers
        }, update, singleUpdate, callback);
      }],
      runJob: ['markJob', (results, callback) => {
        // if update failed it was likely because another worker grabbed the
        // job; loop and try another job
        if(results.markJob.result.n === 0) {
          return loopCallback();
        }
        const record = results.getIdleJob || results.getExpiredJob;
        const job = record.job;
        job.worker = {id: workerId};
        logger.verbose(
          'job worker (' + workerId + ') executing "' + job.type +
          '"' + ' job "' + job.id + '"...');

        try {
          jobTypes[job.type].fn(job, err => callback(null, err || null));
        } catch(ex) {
          callback(null, ex);
        }
      }],
      checkResult: ['runJob', (results, callback) => {
        const record = results.getIdleJob || results.getExpiredJob;
        const job = record.job;
        const error = results.runJob;
        const msg = 'job worker (' + workerId + ') completed "' + job.type +
          '"' + ' job "' + job.id + '"';
        if(error) {
          logger.error(msg + ' with error', error);
        } else {
          logger.verbose(msg);
        }

        // calculate next time to run job
        const due = _getNextJobSchedule(job, {update: true});

        // remove job, not to be rescheduled
        if(due === null) {
          return database.collections.job.remove(
            {id: database.hash(job.id), 'job.type': job.type},
            database.writeOptions, err => callback(err, due));
        }

        // update job with new schedule if old due date is less than or
        // equal to new due date
        database.collections.job.update({
          id: database.hash(job.id),
          'job.type': job.type,
          due: {$lte: due}
        }, {
          $set: {
            'meta.updated': Date.now(),
            'job.schedule': job.schedule,
            due,
            completed: Date.now()
          }
        }, singleUpdate, err => callback(err, due));
      }],
      cleanup: ['checkResult', (results, callback) => {
        // skip cleanup if job was removed (checkResult === null)
        if(results.checkResult === null) {
          return callback();
        }
        const record = results.getIdleJob || results.getExpiredJob;
        const job = record.job;

        // remove worker if it hasn't expired
        const update = {
          $set: {'meta.updated': Date.now()},
          $pull: {workers: workerId}
        };
        // if permits not unlimited, increment
        if(record.permits >= 0) {
          update.$inc = {permits: 1};
        }
        database.collections.job.update({
          id: database.hash(job.id),
          'job.type': job.type,
          workers: workerId
        }, update, singleUpdate, err => callback(err));
      }]
    // prevent stack overflow
    }, err => process.nextTick(() => loopCallback(err)));
  }, err => {
    if(err) {
      logger.error(
        'error while scanning for scheduled jobs on worker (' + workerId + ')',
        {error: err});
    }
    logger.verbose('job worker (' + workerId + ') finished.');

    if(options.reschedule) {
      // reschedule worker if requested
      logger.verbose(
        'rescheduling job worker in ' + options.reschedule + ' ms');
      setTimeout(() => bedrock.events.emitLater(
        {type: EVENT_SCAN, details: {}}), options.reschedule);
    }
    if(callback) {
      callback(err);
    }
  });
}
