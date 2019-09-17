# pay-per-call-API

This package provides an easy way to set-up an API where users pay instantly queries by queries through [obyte payment channels](https://github.com/Papabyte/aa-channels-lib/).


## Server side

* Add to your project `npm install --save https://github.com/Papabyte/aa-channels-lib/`

* Create a conf.js file in your project root folder

```javascript
exports.bServeAsHub = false;
exports.bLight = true;
exports.bSingleAddress = true;

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'pay-per-call API';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = [''];

exports.minChannelTimeoutInSecond = 1000; // minimal channel timeout acceptable
exports.maxChannelTimeoutInSecond = 1000;  // maximal channel timeout acceptable
exports.defaultTimeoutInSecond = 1000; // default timeout for channel creation

exports.unconfirmedAmountsLimitsByAssetOrChannel = { // limits for accepting payments backed by unconfirmed deposit from peer
	"base" : {
		max_unconfirmed_by_asset : 1e6,
		max_unconfirmed_by_channel : 1e6,
		minimum_time_in_second : 5
	}
}

```

* Require module `const payPerCall = require("pay-per-call-API");`

* Initialize `const server = new payPerCall.Server(endPoints, port, max sweeping period in seconds);`

* Configure endpoints

```javascript
const endPoints = {
	endpoint1: (amount_paid, asset, arrArguments, handle) => {
		return handle(error, result, amount_refunded);
	},
	endpoint2: (amount_paid, asset, arrArguments, handle) => {
		return handle(error, result, amount_refunded);
	}
}
```

## Client side

* Create a conf.js file in your project root folder
```javascript
exports.bServeAsHub = false;
exports.bLight = true;
exports.bSingleAddress = true;

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'pay-per-call API client';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = [''];

exports.defaultTimeoutInSecond = 1000; // default timeout for channel creation
```

* Require module `const payPerCall = require("pay-per-call-API");`

* Initialize channel `const client = new payPerCall.Client(peer url, asset, deposits amount, refill threshold);`

* Call endpoint `const result = await client.call(endpoint, amount, [argument1, argument2]);`

* Sweep channel (closing then reopening) when convenient `client.sweepChannel();`, it should happen within the max sweeping period imposed by the server.

* Close channel when you don't need it anymore `client.closeChannel()`