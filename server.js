"use strict";
require('./modules/create_tables.js');
const validationUtils = require("ocore/validation_utils.js");
const channel = require('./modules/channel.js');
const toEs6 = require('./modules/toEs6.js');
const db = require('ocore/db.js');
const network = require("ocore/network.js");
const headlessWallet = require('headless-obyte');
const eventBus = require('ocore/event_bus.js');
const signedMessage = require('ocore/signed_message.js');


eventBus.on('headless_wallet_ready', function(){
	db.query("SELECT aa_address FROM client_channels",function(rows){
		network.requestHistoryFor([], Object.values(rows));
	});
});

class Server {
	constructor(port, endPoints) {
		const express = require('express')
		this.app = express()

		this.app.use(require('body-parser').json());

		//a client requests the creation of a channel, we returns parameters for a new AA address, the definition will be broadcast by client during the first payment
		this.app.post('/create_channel', function(request, response){
			if (typeof request != 'object' || typeof request.body != 'object' || !validationUtils.isValidAddress(request.body.client_address)){
				response.status(400);
				response.send('No address or invalid address provided');
			} else {
				headlessWallet.readFirstAddress(function(server_address){
					if (server_address == request.body.client_address){
						response.status(400);
						return response.send('This address is not yours!');
					}

					db.query("INSERT INTO client_channels (client_address) VALUES (?)",[request.body.client_address], function(result){
						const objAAParameters= channel.getAddressAndParametersForAA(server_address, request.body.client_address, result.insertId);
						db.query("UPDATE client_channels SET aa_address=? WHERE id=?",[objAAParameters.aa_address, result.insertId], function(){
							network.addLightWatchedAddress(objAAParameters.aa_address);
							response.status(200);
							response.send(Object.assign({server_address:server_address}, objAAParameters));
						});
					});
				});
			}
		});

		this.configureEndPoints(endPoints);


		this.app.listen(port);

	}
	
	configureEndPoints(endPoints) {
		this.endPoints = endPoints;
		this.app.post('/:key', function(request, response, next) {
			if (endPoints[request.params.key]){
				var key = request.params.key;
				var arrAguments = []
				getParamNames(endPoints[key].callback).forEach((argument)=>{
					arrAguments.push(request.body[argument]) // we look for POST data matching callback argument names
				});
				response.send(endPoints[key].callback(...arrAguments));
			} else {
				next();
			}
		});	
	}

	checkPaymentFromClient(key, objSignedMessage, handle){
		const price = endPoints[key].price;
		signedMessage.validateSignedMessage(objSignedMessage, address, (error)=>{
			if (error){
				handle(error)
			} else {
				mutex.lock(["check_payment_"+objSignedMessage.aa_address],(unlock)=>{

					var result = await toEs6.dbQuery("SELECT amount_spent,(amount_spent-due_amount) AS credit FROM client_channels WHERE aa_address=?",[objSignedMessage.aa_address]);
					if (!result[0]){
						unlock();
						return handle("no channel found");
					}
					const credit = result[0].credit;
					const amount_already_spent = result[0].amount_spent;
					if (credit >= price){
						toEs6.dbQuery("UPDATE client_channels SET due_amount=due_amount+? WHERE aa_address=?",[price, objSignedMessage.aa_address]);
						unlock();
						return handle(null);
					}

					if (credit + (objSignedMessage.amount_spent - amount_already_spent ) >= price){
						toEs6.dbQuery("UPDATE client_channels SET due_amount=due_amount+?,amount_spent=amount_spent+?,last_message_from_user=? WHERE aa_address=?",
						[price,objSignedMessage.amount_spent, JSON.stringify(objSignedMessage), objSignedMessage.aa_address]);
						unlock();
						return handle(null);
					}

					result = await toEs6.dbQuery("SELECT SUM(amount) AS stable_balance_on_aa FROM outputs CROSS JOIN units USING(unit) WHERE is_spent=0 AND asset IS NULL AND is_stable=1 AND is_serial=1",[objSignedMessage.aa_address]);
				});
				
			}
			
		})

	}


}

//from https://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically
const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '');
  var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if(result === null)
     result = [];
  return result;
}
module.exports = Server;