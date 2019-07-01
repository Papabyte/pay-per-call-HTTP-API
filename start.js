"use strict";
const eventBus = require('ocore/event_bus.js');
const Server = require('./server');

const endPoints = {
	temperature : {
		callback: (lat, long)=>{
			return "20°C";
		},
		price: 20000
	},
	humidity : {
		callback: (lat, long)=>{
			return "82%";
		},
		price: 50
	},
	wind : {
		callback: (lat, long)=>{
			return "5 knots";
		},
		price: 40
	}

}


eventBus.on('headless_wallet_ready', function(){
	
	//we print the price list that has to be given to clients
	const obj = {};
	for (var key in endPoints){
		obj[key] = endPoints[key].price;
	}
	console.log(obj);

	const server = new Server(3000, endPoints);

});
