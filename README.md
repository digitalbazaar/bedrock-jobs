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

## API Reference
## Modules

<dl>
<dt><a href="#module_bedrock-jobs">bedrock-jobs</a></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#QueueOptions">QueueOptions</a> : <code>Object</code></dt>
<dd><p>Bull QueueOptions.</p>
</dd>
</dl>

<a name="module_bedrock-jobs"></a>

## bedrock-jobs
<a name="module_bedrock-jobs.addQueue"></a>

### bedrock-jobs.addQueue(options) ⇒ <code>Queue</code>
Creates a new Bull Queue that is persisted in Redis. Every time a queue
with the same name is instantiated it tries to process all the old
jobs that may exist from a previous unfinished session.

**Kind**: static method of [<code>bedrock-jobs</code>](#module_bedrock-jobs)  
**Returns**: <code>Queue</code> - A Bull Queue.  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  | The options to use. |
| options.name | <code>string</code> |  | The name for the queue. |
| [options.queueOptions] | [<code>QueueOptions</code>](#QueueOptions) | <code>{}</code> | The Bull QueueOptions. |

<a name="QueueOptions"></a>

## QueueOptions : <code>Object</code>
Bull QueueOptions.

**Kind**: global typedef  
**Link**: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queue  
