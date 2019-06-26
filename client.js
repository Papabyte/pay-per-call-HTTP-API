"use strict";
require('./modules/create_tables.js');
const validationUtils = require("ocore/validation_utils.js");
const channel = require('./modules/channel.js');
const toEs6 = require('./modules/toEs6.js');
const request = require('request');
const headlessWallet = require('headless-obyte');
const eventBus = require('ocore/event_bus.js');

class Client {
	constructor(urlServer, filling_amount) {
		this.urlServer = urlServer;
		this.filling_amount = filling_amount;
	}

	init(){
		headlessWallet.readFirstAddress((client_address)=>{
			request.post(this.urlServer+ "/get_channel_address", {
				json: {
					client_address: client_address
				}
			}, (error, res, body) => {
				if (error) {
					console.error(error)
					return
				}
				process.stdout.write(`statusCode: ${res.statusCode}`);
				process.stdout.write(body);
			})

		});
	}
}


module.exports = Client;