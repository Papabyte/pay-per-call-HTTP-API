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
const mutex = require('ocore/mutex.js');
const conf = require('ocore/conf.js');
const myWitnesses = require('ocore/my_witnesses.js');
const light = require('ocore/light.js');
const walletGeneral = require('ocore/wallet_general.js');


eventBus.on('headless_wallet_ready', function() {
	if (!conf.bLight)
		return;

});

eventBus.on('my_transactions_became_stable', async function(arrUnits){
	console.log("my_transactions_became_stable");
		const new_units = await toEs6.dbQuery("SELECT units.unit,outputs.address,period,status,outputs.amount FROM messages \n\
		CROSS JOIN units USING(unit)\n\
		CROSS JOIN outputs USING(unit)\n\
		CROSS JOIN unit_authors USING(unit)\n\
		INNER JOIN client_channels ON (outputs.address=client_channels.aa_address AND unit_authors.address=client_channels.client_address) \n\
		WHERE unit IN("+arrUnits.map(db.escape).join(',')+") AND outputs.asset IS NULL ORDER BY main_chain_index ASC");
		console.log(JSON.stringify(new_units));
		//[{"unit":"X1D4NcFM1fv8yXWbtEr0KdIWEJ3uC52IT6Y/EOL3WcM=","address":"4GUM5MFQKUANUYYAGCX56RXJR5PHSIIE","period":0,"client_address":"new","amount":150000}]
		if (new_units.length === 0){
			unlock();
			return console.log("nothing concerns payment channel in new units received");
		}

		new_units.forEach(async (new_unit)=>{
			if (new_unit.amount && new_unit.amount >= 1e5 && (new_unit.status=='new' || new_unit.status=='closed')){
				toEs6.dbQuery("UPDATE client_channels SET period=period+1,status='open' WHERE aa_address=?",[new_unit.address]);
				return console.log("channel " + new_unit.address + " open");
			}

			const payload_rows =	await toEs6.dbQuery("SELECT payload FROM messages WHERE unit=? ORDER BY message_index ASC LIMIT 1",[new_unit.unit]);
			if (!payload_rows[0])
				return console.log("no message in " + new_unit.address);
			try{
				var payload = JSON.parse(payload_rows[0].payload);
			} catch (e) {
				return console.log("invalid payload");
			}
			if (payload.close &&  payload.transferredFromMe){
				console.log("payload " + JSON.stringify(payload));
				onPeerCloseChannel(new_unit.address, payload.transferredFromMe);
			}
		});


});


async function onPeerCloseChannel(aa_address, amount_declared_spent){
	const rows = await toEs6.dbQuery("SELECT due_amount_by_user FROM client_channels WHERE aa_address=?",[aa_address]);
	if (!rows[0])
		throw Error("closed channel not found");

	if (rows[0].due_amount_by_user <= amount_declared_spent){
		console.log("due amount by user: " + rows[0].due_amount_by_user + " amount_declared_spent: " + amount_declared_spent)
	}

}

class Server {
	constructor(port, endPoints) {
		const express = require('express')
		this.app = express()

		this.app.use(require('body-parser').json());

		//a client requests the creation of a channel, we returns parameters for a new AA address, the definition will be broadcast by client during the first payment
		this.app.post('/create_channel', function(request, response){
			if (typeof request != 'object' || typeof request.body != 'object' || !validationUtils.isValidAddress(request.body.client_address)){
				return	response.send({is_successful: false, error: 'No address or invalid address provided'});
			} else {
				headlessWallet.readFirstAddress(function(server_address){
					if (server_address == request.body.client_address){
						return	response.send({is_successful: false, error: 'This address is not yours!'});
					}

					db.query("INSERT INTO client_channels (client_address) VALUES (?)",[request.body.client_address], function(result){
						const objAAParameters= channel.getAddressAndParametersForAA(server_address, request.body.client_address, result.insertId);
						walletGeneral.addWatchedAddress(objAAParameters.aa_address, ()=>{
							db.query("UPDATE client_channels SET aa_address=? WHERE id=?",[objAAParameters.aa_address, result.insertId], function(){
								response.send({is_successful: true, response: Object.assign({server_address:server_address}, objAAParameters)});
							});
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
		this.app.post('/:key', (request, response, next)=>{
			if (endPoints[request.params.key]){

				this.checkPaymentFromClient(request.params.key,request.body.sent_by_peer, (error)=>{
					if (error){
						console.error(error);

						return	response.send({is_successful: false, error: error});
					} else {
						var key = request.params.key;
						var arrAguments = []
						getParamNames(endPoints[key].callback).forEach((argument)=>{
							arrAguments.push(request.body[argument]) // we look for POST data matching callback argument names
						});
						response.send({is_successful: true, response: endPoints[key].callback(...arrAguments)});
					}

				});

			} else {
				next();
			}
		});	
	}

	checkPaymentFromClient(key, sent_by_peer, handle){
		const price = this.endPoints[key].price;
		signedMessage.validateSignedMessage(sent_by_peer, (error)=>{
			const objSignedMessage = sent_by_peer.signed_message;
			if (error){
				console.error("error when validating message: "+ error);
				handle(error)
			} else {
				console.error("message validated");

				mutex.lock(["check_payment_"+objSignedMessage.channel],async (unlock)=>{
					console.error(JSON.stringify(objSignedMessage));

					var result = await toEs6.dbQuery("SELECT amount_spent_by_user,(amount_spent_by_user-due_amount_by_user) AS credit FROM client_channels WHERE aa_address=?",[objSignedMessage.channel]);
					if (!result[0]){
						unlock();
						return handle("no channel found");
					}
					const credit = result[0].credit;
					const amount_already_spent = result[0].amount_spent_by_user;
					if (credit >= price){
						toEs6.dbQuery("UPDATE client_channels SET due_amount_by_user=due_amount_by_user+? WHERE aa_address=?",[price, objSignedMessage.channel]);
						unlock();
						return handle(null);
					}
					console.error("price " + price);
					console.error("objSignedMessage.amount_spent " + objSignedMessage.amount_spent);
					console.error("amount_already_spent " + amount_already_spent);

					if (credit + (objSignedMessage.amount_spent - amount_already_spent ) >= price){
						result = await toEs6.dbQuery("SELECT SUM(amount) AS stable_balance_on_aa FROM outputs CROSS JOIN units USING(unit) WHERE is_spent=0 AND asset IS NULL AND is_stable=1 AND is_serial=1 AND outputs.address=?",[objSignedMessage.channel]);
						console.error("amount_alresult[0].stable_balance_on_aa " + result[0].stable_balance_on_aa);

						 	
						if (result[0].stable_balance_on_aa >= objSignedMessage.amount_spent){
								toEs6.dbQuery("UPDATE client_channels SET due_amount_by_user=due_amount_by_user+?,amount_spent_by_user=?,last_message_from_user=? WHERE aa_address=?",
								[price,objSignedMessage.amount_spent, JSON.stringify(objSignedMessage), objSignedMessage.channel]);
								unlock();
								return handle(null);
							} else {
								unlock();
								return handle("not enough stable balance on AA");
							}
					} else {
						unlock();
						return handle("amount spent not enough");
					}
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