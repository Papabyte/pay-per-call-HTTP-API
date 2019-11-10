
## Configuration

The configuration is set from a `conf.js` placed in the project folder.

```javascript
exports.bLight = true;
exports.bSingleAddress = true;

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'pay-per-call API client';

exports.defaultTimeoutInSeconds = 1000; // default timeout for channel creation

```

*`bLight`* `boolean` - `true` to run Obyte light node, `false` to run full node. For an API client, light is recommended.

*`bSingleAddress`* `boolean` - must be `true`.

*`hub`* `string` - the hub the node will connect to.

*`defaultTimeoutInSeconds`* `number` - timeout in second for channel closure confirmation, must be in the range accepted by server.


## Create client instance

```javascript
const payPerCall = require("pay-per-call-HTTP-API");
const client = new payPerCall.Client(peer_url, asset, deposit_amount, refill_threshold);
```
It will create the channel if it doesn't exist yet. For channel creation, the headless wallet has to be funded and the API server has to be reachable otherwise an error will be thrown.

#### Parameters

*`peer_url`* `string` - API server's URL\
*`asset`* `string` - asset used for payments, `base` for bytes\
*`deposit_amount`* `number` - amount of first deposit and subsequent refillings\
*`refill_threshold`* `number` - available spendable amount below which a new deposit will be made\


## Call endpoint 

```javascript
const result = await client.call(endpoint, amount, arrArgs);
```

*`result`* `string`, `number`, `array` or `object` - Result returned by API server\
*`endpoint`* `string` - the name of the called endpoint (specific to server API)\
*`amount`* `amount` - payment sent for this request\
*`arrArgs`* `array` - arguments for the request (specific to server API)\


## Sweep channel 
```javascript
client.sweepChannel();
```
The channel has to be swept periodically so on chain settlement can happen. It is done by closing the channel then reopening it with a new deposit. During this time, it's not possible to call the API, that's why it's up to the client to sweep when it is convenient for him. The maximal period the channel can be kept opened without setting depends of the API server configuration, when over limit, server will initiate the channel sweeping.