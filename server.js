"use strict";
const channels = require("../aa-channels-lib/");

const endPoints = {
	temperature : {
		result: (lat, long, handle)=>{
		if (lat <	-90 || lat > 90)
			return handle("wrong latitude");
		if (long <	-180 || long > 180)
			return handle("wrong longitude");
		return handle(null,"20°C");
		},
		price: 20000
	},
	humidity : {
		result: (lat, long)=>{
		if (lat <	-90 || lat > 90)
			return handle("wrong latitude");
		if (long <	-180 || long > 180)
			return handle("wrong longitude");
		return handle(null,"82%");
		},
		price: 50
	},
	wind : {
		result: (lat, long)=>{
		if (lat <	-90 || lat > 90)
			return handle("wrong latitude");
		if (long <	-180 || long > 180)
			return handle("wrong longitude");
		return "5 knots";
		},
		price: 40
	}
}

channels.setCallBackForPaymentReceived(function(amount, arrOrder, peer_address, handle){
	const endPoint = arrOrder[0];
	const arrAguments = arrOrder[1];

	if (!endPoints[endPoint])
		return handle({error:"unknown endpoint"});

	if (arrAguments.length !== (endPoints[endPoint].result.length +1))
		return handle({error:"wrong parameters number, expected : " + (endPoints[endPoint].result.length +1) +  ", received "+ arrAguments.length});
	
	if (endPoints[endPoint].price > amount)
		return handle({error:"payment expected for this endpoint " + endPoints[endPoint].price + " byte"});

	endPoints[endPoint].result(...arrAguments, function(error, result){
		if (error)
			return handle({error:error});
		else
			return handle(result);
	})

});

//we print the price list that has to be given to clients
const obj = {};
for (var key in endPoints){
	obj[key] = endPoints[key].price;
}
console.log(obj);

