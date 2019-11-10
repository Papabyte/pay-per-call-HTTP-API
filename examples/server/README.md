## Configuration

The configuration is set from a `conf.js` placed in the project folder.

```javascript
exports.bLight = true;
exports.bSingleAddress = true;

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'pay-per-call API server';

exports.minChannelTimeoutInSecond = 1000;
exports.maxChannelTimeoutInSecond = 1000;

exports.unconfirmedAmountsLimitsByAssetOrChannel = {
	"base" : {
		max_unconfirmed_by_asset : 1e6,
		max_unconfirmed_by_channel : 1e6,
		minimum_time_in_second : 5
	}
}

```
*`bLight`* `boolean` - `true` to run Obyte light node, `false` to run full node.\
	- full node: has to sync the whole DAG prior to operations\
	- light node: no sync require, but confirmed deposits to AA will be seen after a few minutes lag\

*`bSingleAddress`* `boolean` - must be `true`.

*`hub`* `string` - the hub the node will connect to.

*`minChannelTimeoutInSecond`* `number` - minimal timeout in seconds acceptable for a channel created by client .
*`maxChannelTimeoutInSecond`* `number` - maximal timeout in seconds acceptable for a channel created by client .

*`unconfirmedAmountsLimitsByAssetOrChannel`* `object` - set limits for payment backed with unconfirmed deposits.\
	- *property name*: the asset to which the lmits apply (`base` for bytes)\
	- *max_unconfirmed_by_asset*: number - maximal unconfirmed amount that can be accepted in overall for an asset at anytime\
	- *max_unconfirmed_by_channel*: number - maximal unconfirmed amount in this asset that can be accepted for a channel at anytime\
	- *minimum_time_in_second*: number - time in seconds after deposit when unconfirmed amount can be taken into account\

## Create server instance

```
const payPerCall = require("pay-per-call-HTTP-API");
const server = new payPerCall.Server(endPoints, port, maxSweepingPeriod);
```

#### Parameters

*`endPoints`* `object` - Your API's endpoints. The property name is the endpoint's name, the property value is a function as below that is executed to get the result.

```javascript
/*
* @amount_paid: number - amount paid by client for the request
* @asset: string - 'base' for payment in bytes or 
* @arrArguments: array - arguments provided by client for the request
* @handle: callback
*/
(amount_paid, asset, arrArguments, handle) => {
	/*
	* @error: string - error returned to user if request cannot be honored, null if successful
	* @result: string, array, number or object - result for the request
	* @amount_refunded: numer - amount refunded to client, 0 if no refund
	*/
	return handle(error, result, amount_refunded);
}
```

Example of endpoints object:
```javascript
const endPoints = {
	endpoint1: (amount_paid, asset, arrArguments, handle) => {
		return handle(null, "you have paid " + amount_paid, 0);
	},
	endpoint2: (amount_paid, asset, arrArguments, handle) => {
		return handle(null, "you have paid " + amount_paid, 0);
	}
}
```

*`port`* `number` - The port that HTTP server will listen


*`maxSweepingPeriod`* `number` - Time in seconds after which the server will automatically close the channel if client didn't do it meanwhile.

