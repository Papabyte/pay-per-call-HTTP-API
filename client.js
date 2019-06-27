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


class Client {
	constructor(urlServer, filling_amount, filling_threshold) {
		this.urlServer = urlServer;
		this.filling_threshold = filling_threshold;
		this.filling_amount = filling_amount;

	}

	init(){
		return new Promise(async (resolve, reject) => {
			const	existingChannel = await toEs6.dbQuery("SELECT 1 FROM provider_channels WHERE url=?",[this.urlServer]);
			if (existingChannel.length === 0){
				this.createChannel().then(resolve,reject);
			} else {
				this.aa_address = existingChannel.aa_address;
				this.definition = existingChannel.definition;

				this.refillChannelIfNecessary()

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
									this.sendDefinitionAndFillChannel().then(()=>{
										unlock();
										resolve("channel opened");
									});
							} else {
								unlock();
								reject("channel for this provider was created by another thread");
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

			composeContentJointAndFill(await this.getMyAddress()	, this.filling_amount, 'definition', payload, headlessWallet.signer, callbacks);
		});
	}


}

function composeContentJointAndFill(from_address, amount, app, payload, signer, callbacks){
	var composer = require('ocore/composer.js');
	var objMessage = {
		app: app,
		payload_location: "inline",
		payload_hash: objectHash.getBase64Hash(payload),
		payload: payload
	};
	console.log("address " + payload.address);
	console.log("amount " + amount);

	composer.composeJoint({
		paying_addresses: [from_address], 
		outputs: [{address: from_address, amount: 0}, {address: payload.address, amount: amount}], 
		messages: [objMessage], 
		signer: signer, 
		callbacks: callbacks
	});
}



module.exports = Client;