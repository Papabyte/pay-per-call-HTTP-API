const payPerCall = require("../../");

const client = new payPerCall.Client("http://127.0.0.1:6000", null, 50000, 10000); // (peer url, asset, deposits amount, refill threshold)

client.startWhenReady().then(async function(){
	console.error("client started");

	const result = await client.call("temperature", 5000, [50,40]);
	console.error(result.error);
	console.error(result.result);
	console.error(result.refunded_amount);

});



