# bedrock-jobs

A job queue for Bedrock applications backed by
[Bull](https://github.com/OptimalBits/bull).

## Usage
If multiple instances of the same Bedrock application are running on the same
Redis server, a unique `prefix` should be assigned in each application's
Bedrock configuration. This is analogous to specifying a different database
for each application when using `bedrock-mongodb`.
```
config.jobs.queueOptions.prefix = 'myApplicationPrefix';
```

# API Reference
<a name="module_bedrock-jobs"></a>

## bedrock-jobs
<a name="module_bedrock-jobs.addQueue"></a>

### bedrock-jobs.addQueue(options) ⇒ <code>Queue</code>
Creates a new Bull Queue that is persisted in Redis. Everytime a queue
with the same name is instantiated it tries to process all the old
jobs that may exist from a previous unfinished session.

**Kind**: static method of [<code>bedrock-jobs</code>](#module_bedrock-jobs)  
**Returns**: <code>Queue</code> - A Bull Queue.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.name | <code>string</code> |  | The name for the queue. |
| [options.queueOptions] | <code>QueueOptions</code> | <code>{}</code> | The Bull QueueOptions. |

