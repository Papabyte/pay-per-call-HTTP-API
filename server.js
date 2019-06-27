"use strict";
require('./modules/create_tables.js');
const validationUtils = require("ocore/validation_utils.js");
const channel = require('./modules/channel.js');
const toEs6 = require('./modules/toEs6.js');
const db = require('ocore/db.js');
const network = require("ocore/network.js");
const headlessWallet = require('headless-obyte');
const eventBus = require('ocore/event_bus.js');

eventBus.on('headless_wallet_ready', function(){
	db.query("SELECT aa_address FROM client_channels",function(rows){
		network.requestHistoryFor([], Object.values(rows));
	});
});

class Server {
	constructor(port) {
		const express = require('express')
		this.app = express()
		// Parse URL-encoded bodies (as sent by HTML forms)

		this.app.use(require('body-parser').json());

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


		this.app.listen(port);

	}
	
	configureEndpoints() {
	
	}
	
	

}


module.exports = Server;