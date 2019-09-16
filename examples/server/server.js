const payPerCall = require("../../");

const endPoints = {
	temperature: (amount_paid, asset, arrArguments, handle) => {
		const endPointPrice = 2000;
		if (asset != 'base')
			return handle("wrong asset", null, amount_paid);
		if (amount_paid < endPointPrice)
			return handle("price: " + endPointPrice + ", received amount: " + amount, null, amount_paid);

		var lat = arrArguments[0];
		var long = arrArguments[1];
		if (lat < -90 || lat > 90)
			return handle("wrong latitude", null, amount_paid);
		if (long < -180 || long > 180)
			return handle("wrong longitude", null, amount_paid);
		return handle(null, "20°C",  amount_paid - endPointPrice > 0 ? amount_paid - endPointPrice : null); // result is send in second parameters, first parameter has to be null when no error
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


const server = new payPerCall.Server(endPoints, 6000);
server.startWhenReady().then(function(){console.error("server started")});

