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
const objectHash = require('ocore/object_hash.js');
const aaValidation = require('ocore/aa_validation.js');



eventBus.on('headless_wallet_ready', async function() {
	treatNewStableUnits(); // we look for units that weren't treated in case node was interrupted at bad time
});

async function getSqlFilterForNewOutputsToOrFromChannels(){
	return new Promise(async (resolve, reject) => {
		const rows = await toEs6.dbQuery("SELECT client_address,last_updated_mci,aa_address FROM client_channels");
		var string = rows.length > 0 ? " (" : " 0 AND ";
		var i = 0;
		rows.forEach(function(row){
			i++;
			string += "((author_address='" + row.client_address + "' AND outputs.address='"+row.aa_address + "' OR author_address='" + row.aa_address + "') " + " AND main_chain_index>"  + row.last_updated_mci +") ";
			string += rows.length > i ? " OR " : "";
		});
		string += rows.length > 0 ? ") AND " : ""
		resolve(string);
	});
}

eventBus.on('my_transactions_became_stable', async function(arrUnits){
	console.log("my_transactions_became_stable");
	treatNewStableUnits(arrUnits);
});

function treatNewStableUnits(arrUnits){	
	mutex.lock(['treatNewStableUnits'], async (unlock)=>{
	var unitFilter = arrUnits ? " unit IN("+arrUnits.map(db.escape).join(',')+") AND " : ""; 

	const new_units = await toEs6.dbQuery("SELECT units.unit,outputs.address AS output_address,outputs.amount,main_chain_index,unit_authors.address AS author_address FROM messages \n\
		CROSS JOIN units USING(unit)\n\
		CROSS JOIN outputs USING(unit)\n\
		CROSS JOIN unit_authors USING(unit)\n\
		WHERE "+unitFilter+ await getSqlFilterForNewOutputsToOrFromChannels() + " outputs.asset IS NULL AND is_stable=1 AND sequence='good' GROUP BY units.unit ORDER BY main_chain_index ASC");
		if (new_units.length === 0){
			unlock();
			return console.log("nothing concerns payment channel in these units");
		}

		for (var i=0; i<new_units.length; i++) {
			var new_unit= new_units[i];
			var channels = await toEs6.dbQuery("SELECT * FROM client_channels WHERE aa_address=? OR aa_address=?",[new_unit.output_address, new_unit.author_address ]);
			if (!channels[0])
				throw Error("channel not found");
			console.log("treat new unit " + JSON.stringify(new_unit));
			
			var channel = channels[0];
			if (new_unit.amount && new_unit.amount >= 1e5 && (channel.status=='new' || channel.status=='closed')){
			 await	toEs6.dbQuery("UPDATE client_channels SET period=1,status='open',last_updated_mci=? WHERE aa_address=?",[new_unit.main_chain_index,new_unit.output_address]);
				console.log("channel " + new_unit.output_address + " open");
			} else {

					var payloads =	await toEs6.dbQuery("SELECT payload FROM messages WHERE unit=? AND app='data' ORDER BY message_index ASC LIMIT 1",[new_unit.unit]);
					console.log("payload " + JSON.stringify(payloads));

					if (!payloads[0] || !payloads[0].payload) {
						console.log("no message in " + new_unit.unit);
					} else {
					try{
						var payload = JSON.parse(payloads[0].payload);
					} catch (e) {
						console.log("invalid payload" + e);
					}
					if (payload.close && payload.transferredFromMe >=0 && new_unit.author_address == channel.client_address){
						console.log("onPeerCloseChannel");
						onPeerCloseChannel(channel.aa_address, payload.transferredFromMe, new_unit.main_chain_index, channel);
					} else if (payload.closed && new_unit.author_address == channel.aa_address ){
						console.log("onClosedChannel");
						if (payload.period != channel.period)
							throw Error("period mismatches")
					 await onClosedChannel(channel.aa_address, new_unit.main_chain_index);
					}
				}
			}
		}
		unlock();
	});
}


async function onClosedChannel(aa_address, mci){
	await toEs6.dbQuery("UPDATE client_channels SET status='closed',last_updated_mci=? WHERE aa_address=?",[mci,aa_address]);
}


async function onPeerCloseChannel(aa_address, amount_declared_spent, mci, channel){
	return new Promise(async (resolve, reject) => {

		if (channel.due_amount_by_user <= amount_declared_spent){ 
			console.log("channel status " + channel.status + " due amount by user: " +channel.due_amount_by_user + " amount_declared_spent: " + amount_declared_spent);

			var objDataMessage = {
				app: 'data',
				payload_location: 'inline',
				payload: {
						confirm: 1
					},
			};
			headlessWallet.readFirstAddress((server_address)=>{
				objDataMessage.payload_hash = objectHash.getBase64Hash(objDataMessage.payload);
				var messages = [objDataMessage];
				var opts = { amount: 1e4, paying_addresses: [server_address], to_address: aa_address, messages: messages };
				opts.change_address = opts.paying_addresses[0];
				
				headlessWallet.sendMultiPayment(opts, async (err, unit)=>{
					if (err){
						console.error('------- sent, err=' + err + ', unit=' + unit);
						reject(err);
					} else {
						await toEs6.dbQuery("UPDATE client_channels SET status='confirming',last_updated_mci=? WHERE aa_address=?",[mci,aa_address]);
						resolve();
					}
				});
			});
		}
	})
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

						aaValidation.validateAADefinition(objAAParameters.definition, (error)=>{
							if (error)
								throw Error(error);
						});

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

	getMyAddress(){
		return new Promise(async (resolve, reject) => {
			if (!this.myAddress){
				headlessWallet.readFirstAddress((myAddress)=>{
					this.myAddress = myAddress;
					return resolve(myAddress);
				});
			}	else {
				return resolve(this.myAddress);
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