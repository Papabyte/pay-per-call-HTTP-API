const payPerCall = require("../../");

const endPoints = {
	temperature: (amount_paid, asset, arrArguments, handle) => {
		const endPointPrice = 2000;
		if (asset != 'base')
			return handle("wrong asset", null, amount_paid);
		if (amount_paid < endPointPrice)
			return handle("price: " + endPointPrice + ", received amount: " + amount_paid, null, amount_paid);
		var lat = arrArguments[0];
		var long = arrArguments[1];
		if (lat < -90 || lat > 90)
			return handle("wrong latitude", null, amount_paid); // we return error and a full refund
		if (long < -180 || long > 180)
			return handle("wrong longitude", null, amount_paid); // we return error and a full refund
		return handle(null, "20°C",  amount_paid - endPointPrice > 0 ? amount_paid - endPointPrice : null); // we return result and potentially the overpayment amount to be refunded
	},
	humidity: (amount_paid, asset, arrArguments, handle) => {
		const endPointPrice = 5000;
		if (asset != 'base')
			return handle("wrong asset", null, amount_paid);
		if (amount < endPointPrice)
			return handle("price: " + endPointPrice + ", received amount: " + amount, null, amount_paid);

		var lat = arrArguments[0];
		var long = arrArguments[1];
		if (lat < -90 || lat > 90)
			return handle("wrong latitude", null, amount_paid);
		if (long < -180 || long > 180)
			return handle("wrong longitude", null, amount_paid);
		return handle(null, "82%", amount_paid - endPointPrice > 0 ? amount_paid - endPointPrice : null );
	}
}


const server = new payPerCall.Server(endPoints, 6000, 60*60*24*7); // we listen on port 6000

server.startWhenReady().then(function(){ // server will actually starts after the passphrase for headless wallet is entered
	console.error("server started") 
});

