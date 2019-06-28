"use strict";
require('./modules/create_tables.js');
const validationUtils = require("ocore/validation_utils.js");
const channel = require('./modules/channel.js');
const toEs6 = require('./modules/toEs6.js');
const request = require('request');
const headlessWallet = require('headless-obyte');
const eventBus = require('ocore/event_bus.js');
const db = require('ocore/db.js');
const mutex = require('ocore/mutex.js');
const objectHash = require('ocore/object_hash.js');
const signedMessage = require('ocore/signed_message.js');

class Client {
	constructor(urlServer, params) {
		this.urlServer = urlServer;
		this.filling_threshold = params.filling_threshold;
		this.filling_amount = params.filling_amount;
		this.price_list = params.price_list;
		this.state = 'not_ready';
	}

	init(){
		return new Promise(async (resolve, reject) => {
			const	existingChannel = await toEs6.dbQuery("SELECT aa_address,period FROM provider_channels WHERE url=?",[this.urlServer]);
			if (existingChannel.length === 0){
				this.createChannel().then(resolve,reject);
			} else {
				this.aa_address = existingChannel[0].aa_address;
				this.period = existingChannel[0].period;

				mutex.lock(['refill_if_necessary_'+ this.urlServer], (unlock)=>{
					this.refillChannelIfNecessary().then(()=>{
						this.state = 'ready';
						resolve("existing channel opened");
						unlock();
					});
				});
			}
		});
	}

	async createChannel(){
		return new Promise(async (resolve, reject) => {
			const client_address = await this.getMyAddress();
			request.post(this.urlServer+ "/create_channel", {
				json: {
					client_address: client_address
				}
			}, (error, res, body) => {
				if (error) {
					process.stdout.write("error when requesting channel" + error);
					return setTimeout(()=>{
						this.createChannel(resolve);
					}, 60000);
				}

				if (res.statusCode === 200){

					const objCalculatedAAParameters= channel.getAddressAndParametersForAA(body.server_address, client_address, body.id, body.version);
					if (objCalculatedAAParameters.aa_address != body.aa_address)
						return reject(`Incorrect AA address provided, calculated: ${objCalculatedAAParameters.aa_address} provided: ${body.aa_address}`);


						mutex.lock(['create_channel_with_provider'], async (unlock)=>{
							const result = await toEs6.dbQuery("SELECT 1 FROM provider_channels WHERE url=?",[this.urlServer]);
							if (result.length === 0){
									this.aa_address = body.aa_address;
									this.arrDefinition = objCalculatedAAParameters.definition;
									this.aa_id = body.id;
									this.aa_version = body.version;
									this.period = 1;
									this.sendDefinitionAndFillChannel().then(()=>{
										resolve("new channel opened");
										unlock();
									});
							} else {
								reject("channel for this provider was created by another thread");
								unlock();
							}

						});

					return resolve(JSON.stringify(body));
				}  else {
					return reject(body);
				}
			});
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

	async sendDefinitionAndFillChannel(){
		return new Promise(async (resolve, reject) => {

			var payload = { address: this.aa_address, definition: this.arrDefinition };

			var composer = require('ocore/composer.js');
			var network = require('ocore/network.js');
			var callbacks = composer.getSavingCallbacks({
				ifNotEnoughFunds: ()=>{
					setTimeout(()=>{
						console.log(`not enough fund for ${this.filling_amount}`)
						this.sendDefinitionAndFillChannel();
					}, 30000);
				},
				ifError: (error)=>{
					setTimeout(()=>{
						console.log(error)
						this.sendDefinitionAndFillChannel();
					}, 30000);
				},
				preCommitCb: (conn, objJoint, handle)=>{
					conn.query("INSERT INTO provider_channels (url,id,aa_address,version) VALUES (?,?,?,?)",[this.urlServer, this.aa_id, this.aa_address,  this.aa_version]);
					handle();
				},
				ifOk: function(objJoint){
					network.broadcastJoint(objJoint);
					resolve();
				}
			})

			composeContentJointAndFill(await this.getMyAddress()	, this.filling_amount, 'definition', payload, callbacks);
		});
	}


	async refillChannelIfNecessary () {
		return new Promise(async (resolve, reject) => {

			const result = await toEs6.dbQuery("SELECT (SUM(amount) - (SELECT amount_spent FROM provider_channels WHERE aa_address=?)) \n\
			AS free_balance_on_aa FROM outputs CROSS JOIN units USING(unit) CROSS JOIN unit_authors USING(unit) WHERE is_spent=0 AND asset IS NULL AND outputs.address=? AND unit_authors.address=?",[this.aa_address,this.aa_address, await this.getMyAddress() ]);

			if (result.length == 0)
				throw Error("No outputs to AA-address"); 

			if (result[0].free_balance_on_aa < this.filling_threshold){

				var composer = require('ocore/composer.js');
				var network = require('ocore/network.js');
				var callbacks = composer.getSavingCallbacks({
					ifNotEnoughFunds: ()=>{
						setTimeout(()=>{
							console.log(`not enough fund for ${this.filling_amount}`)
							this.refillChannelIfNecessary();
						}, 30000);
					},
					ifError: (error)=>{
						setTimeout(()=>{
							console.log(error)
							this.refillChannelIfNecessary();
						}, 30000);
					},
					ifOk: function(objJoint){
						network.broadcastJoint(objJoint);
						resolve();
					}
				})
				composer.composeJoint({
					paying_addresses: [await this.getMyAddress()], 
					outputs: [{address: await this.getMyAddress(), amount: 0}, {address: this.aa_address, amount: this.filling_amount}], 
					signer: headlessWallet.signer, 
					callbacks: callbacks
				});
			} else {
				resolve();
			}
				
		});
	}

	async callApi (endpoint, parameters, handle){
		const price = this.price_list[endpoint];
		if (!price)
			return handle("price_not_known_for_endpoint");
		if (this.state != "ready")
			return handle("channel not ready");

		mutex.lock(['call_api_'+ this.urlServer], async (unlock)=>{
			var result = await toEs6.dbQuery("SELECT (SUM(amount) - (SELECT amount_spent FROM provider_channels WHERE aa_address=?)) \n\
				AS free_stable_balance_on_aa FROM outputs CROSS JOIN units USING(unit) WHERE is_spent=0 AND asset IS NULL AND is_stable=1 AND is_serial=1",[this.aa_address]);

			if (result.length == 0)
				throw Error("No outputs to AA-address"); 

			if (price > result[0].free_stable_balance_on_aa){
				unlock();
				return handle("not enough free stable balance on AA");
			}

			result = await toEs6.dbQuery("SELECT * FROM provider_channels WHERE aa_address=?",[this.aa_address]);
			const sentByPeer = await signMessage({amount_spent: (price + result[0].amount_spent), period: this.period, channel: this.aa_address}, await this.getMyAddress());

			const obj = Object.assign({sent_by_peer: sentByPeer}, parameters);
			request.post(this.urlServer + "/" + endpoint, {
				json: obj
			}, async (error, res, body) => {
				if (error) {
					process.stdout.write("error when calling API channel" + error);
					unlock();
					return handle(error);
				}
				if (res.statusCode === 200){
					await	toEs6.dbQuery("UPDATE provider_channels SET amount_spent=amount_spent+? WHERE aa_address=?",[price, this.aa_address]);
					unlock();
					return handle(null, body);
				}
			});



		});
	}
}

function composeContentJointAndFill(from_address, amount, app, payload, callbacks){
	var composer = require('ocore/composer.js');
	var objMessage = {
		app: app,
		payload_location: "inline",
		payload_hash: objectHash.getBase64Hash(payload),
		payload: payload
	};

	composer.composeJoint({
		paying_addresses: [from_address], 
		outputs: [{address: from_address, amount: 0}, {address: payload.address, amount: amount}], 
		messages: [objMessage], 
		signer: headlessWallet.signer, 
		callbacks: callbacks
	});
}

function signMessage(message, address) {
	return new Promise((resolve, reject) => {
			console.error("signing...");
			signedMessage.signMessage(message, address, headlessWallet.signer, true, function (err, objSignedPackage) {
					console.error("---- res", err, JSON.stringify(objSignedPackage, null, '\t'));
					if (err)
							return reject(err);
					resolve(objSignedPackage);
			});
	});
}

module.exports = Client;