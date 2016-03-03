# bedrock-jobs

A [bedrock][] module that exposes an API for scheduling and executing
background jobs.

## Requirements

- npm v3+

## Quick Examples

```
npm install bedrock-jobs
```

```js
var bedrock = require('bedrock');

require('bedrock-mongodb');
var scheduler = require('bedrock-jobs');

bedrock.config.scheduler.jobs.push({
  id: 'myproject.jobs.Scan',
  type: 'myproject.jobs.Scan',
  // repeat forever, run every minute
  schedule: 'R/PT1M',
  // no special priority
  priority: 0,
  // no concurrency limit, every bedrock worker can run one of these jobs
  concurrency: -1
});

bedrock.events.on('bedrock.init', function() {
  // define job type so it will run in this bedrock instance
  scheduler.define('myproject.jobs.Scan', function(job, callback) {
    doSomeKindOfScan(function(err) {
      // scan finished
      callback(err);
    });
  });
});
```

## Configuration

Jobs can be automatically scheduled by specifying `job` objects in
`bedrock.config.scheduler.jobs`.

For more documentation on configuration, see [config.js](./lib/config.js).

## API

### define(type, [options], fn)

Defines a new job type. Schedules jobs will only be processed if their types
have been defined. A job `type` (a unique string) specifies:

* The function that will be run to process a job of that type
* How many workers can run a job of that type at the same time
* How long a particular worker that is running a job of that type may run
  before being considered expired, freeing another worker to take its place
  and restart the job

Note that, due to current implementation limitations, lock duration can only
be configured on a per-job-type basis, it cannot be configured per-job.

The `options` may include:

* **lockDuration** how long, in milliseconds, a job of this type will execute
  in isolation before another worker may reattempt it; note that if a job is
  scheduled to repeat, the lock duration should always be less than the
  schedule or else the job may not be processed on time.
* **defaults** default job values to use:
  * **schedule** how often to run the job; schedules must be given as strings
    in [ISO 8601][] time interval format.
  * **priority** a number indicating priority, 0 for default, negative
    for low, positive for high.
  * **concurrency** the number of workers that can concurrently work on a job,
    `-1` for unlimited.

Any `options.defaults` given will override the defaults specified by
`bedrock.config.scheduler.defaults`.

The `fn` parameter is a function to call to execute the job. It takes a `job`
object and a `callback` as parameters. Once the job completes (or an error
occurs that causes it to stop), the `callback` must be called. If an error
occurs, it should be passed to the `callback`.

### generateJobId(callback)

Creates a new job ID. The `callback` will be called once the ID is ready or
if an error occurs. The first parameter will be an error or `null` and the
second will be the ID.

### schedule(job, [options], callback)

Schedules a new job. The `job` must have a type set (`job.type`). It may
specify a unique id, if it does not, one will be generated. It may also specify
how often to run the job and any job-specific data. The `job` will be passed
to the function that was previously passed to `define` to define its type.

Jobs may be scheduled that do not have defined types, however, they will never
be executed by this particular scheduler (other schedulers may execute them).
This allows distributed systems that share a common database to be configured
such that some machines will execute certain types of jobs that are found in
the database whilst others will not. For example, one machine may only run
jobs of type **A** and one machine may only run jobs of type **B**, but both
may be capable of scheduling either type of job.

The `options` may include:

* **immediate** `true` to run the job immediately if its schedule permits.

The `callback` will be called once the scheduling operation completes or if
an error occurs. If an error occurred, it will be passed to the `callback`.

### unschedule(options, callback)

Unschedules a job or all jobs of a certain type. The `options` parameter must
be given any have **either**:

* **id** the id of the job to unschedule, or
* **type** the type of jobs to unschedule.

The `callback` will be called once the operation completes. If an error occurs,
it will be passed to the `callback`.


[bedrock]: https://github.com/digitalbazaar/bedrock
[ISO 8601]: http://en.wikipedia.org/wiki/ISO_8601
