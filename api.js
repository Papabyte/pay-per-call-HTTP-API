
const channels = require("aa-channels-lib");
const eventBus = require("ocore/event_bus.js");
const validationUtils = require('ocore/validation_utils.js');
const db = require('ocore/db.js');

var areAAchannelsReady = false;

eventBus.on('aa_channels_ready', function(){
	areAAchannelsReady = true;
});

class Server {
	constructor(assocEndPoints, port, sweepingPeriod) {
		this.assocEndPoints = assocEndPoints;
		this.port = port;
		this.sweepingPeriod = sweepingPeriod;
		if (areAAchannelsReady){
			this.start();
		} else {
			eventBus.on('aa_channels_ready', ()=>{
				this.start();
			});
		}
	}

	async waitNodeIsReady(){
		return new Promise((resolve) => {
			if (areAAchannelsReady){
					return resolve();
			} else {
				eventBus.on('aa_channels_ready', ()=>{
						return resolve();
				});
			}
		})
	}

	start(){
		channels.startHttpServer(this.port);
		channels.setCallBackForPaymentReceived((amount, asset, arrReceivedFromPeer, aa_address, handle) => {
			const endPoint = arrReceivedFromPeer[0];
			const arrAguments = arrReceivedFromPeer.slice(1);

			//we execute the function associated to the endpoint
			//in return, we should obtain an error or a result, and possibly an amount that has to be refunded
			this.assocEndPoints[endPoint](amount, asset, arrAguments, function(error, result, refunded_amount) {
				if (error) {
					channels.createPaymentPackage(amount, aa_address, function(getPackageError, objPaymentPackage){
						if (getPackageError)
							return handle({error: error})
						else
							return handle({error: error, refund: objPaymentPackage});
					});
				} else {
					if (refunded_amount > 0){ // if we were instructed to send a refund, we get the corresponding payment package
						channels.createPaymentPackage(amount, aa_address, function(getPackageError, objPaymentPackage){
							if (getPackageError)
								return handle(null, {result: result});
							else
								return handle(null, {result: result, refund: objPaymentPackage});
						});
					} else {
						return handle(null, {result: result});
					}
				}
			});
		});
		setInterval(()=>{
			this.sweepChannelsIfPeriodExpired(this.sweepingPeriod);
		}, 60000);
	}
	// we read timestamp corresponding to last updating mci of opened channel, if too old we close it to sweep fund on it
	async sweepChannelsIfPeriodExpired(sweepingPeriod){
		await this.waitNodeIsReady()
		db.query("SELECT aa_address FROM channels INNER JOIN units ON units.main_chain_index=channels.last_updated_mci \n\
		WHERE status='open' AND (strftime('%s', 'now')-timestamp) > ?", [sweepingPeriod], (rows)=>{
			rows.forEach((row)=>{
				channels.close(row.aa_address, (error)=>{});
			})
		});
	}

}


class Client {

	constructor(peer_url, asset, fill_amount, refill_threshold) {
		this.peer_url = peer_url;
		this.asset = asset;
		this.fill_amount = fill_amount;
		this.refill_threshold = refill_threshold;
		if (areAAchannelsReady){
			this.start();
		} else {
			eventBus.on('aa_channels_ready', ()=>{
				this.start();
			});
		}
	}

	waitNodeIsReady(){
		return new Promise((resolve) => {
			if (this.aa_address ){
					return resolve();
			} else {
				eventBus.on('client_ready', ()=>{
						return resolve();
				});
			}
		})
	}

	start(){
		return new Promise((resolve, reject) => {
			channels.getChannelsForPeer(this.peer_url, this.asset, (error, aa_addresses) => {
				if (error) {
					console.log("no channel found for this peer, I'll create one");
					channels.createNewChannel(this.peer_url, this.fill_amount, {
						salt: true,
						asset: this.asset
					}, (error, aa_address)=>{
						if (error)
							throw Error(error);
						this.aa_address = aa_address;
						eventBus.emit('client_ready')
						channels.setAutoRefill(aa_address, this.fill_amount, this.refill_threshold, ()=>{});
						return resolve();
					});
				} else {
					this.aa_address = aa_addresses[0];
					eventBus.emit('client_ready')
					channels.setAutoRefill(aa_addresses[0], this.fill_amount, this.refill_threshold, ()=>{});
					return resolve();
				}
			});
		});
	}

	call(endpoint, amount, arrArguments){
		return new Promise(async (resolve, reject) => {
			await this.waitNodeIsReady();
			if (!validationUtils.isPositiveInteger(amount))
				return reject("amount must be a positive integer");
			if (!Array.isArray(arrArguments))
				return reject("arrArguments must be an array");

			channels.sendMessageAndPay(this.aa_address, [endpoint].concat(arrArguments), amount, (error, response)=>{

				if (error){
					if (typeof error == 'object' && error.refund){ // alongside with error a refund has been returned, we verify its payment package
						channels.verifyPaymentPackage(error.refund, function(verification_error, amount){
							if (verification_error){
								return resolve({
									error: error.error + ", error while verifying refund:  " + verification_error,
									refunded_amount: 0
								});
							} else {
								return resolve({
									error: error.error,
									refunded_amount: amount
								});
							}
						});
					} else {
						return resolve({
							error: error,
							refunded_amount: 0
						});
					}
				} else {
					if (response.refund){ // alongside with result a refund has been returned, we verify its payment package
						channels.verifyPaymentPackage(response.refund, function(verification_error, refunded_amount){
							if (verification_error){
								return resolve({
									error: verification_error,
									result: response.result,
									refunded_amount: 0
								});
							} else {
								return resolve({
									result: response.result,
									refunded_amount: refunded_amount
								});
							}
						});
					} else {
						return resolve({
							result: response.result,
							refunded_amount: 0
						});
					}
				}
			});
		});
	}

	sweep() {
		return new Promise(async (resolve, reject) => {
			await this.waitNodeIsReady();
			channels.close(this.aa_address, (error)=>{
				if (error){
					console.log(error + ", will retry later");
					setTimeout(()=>{
						this.close().then(()=>{
							return resolve();
						})
					}, 30000)
				}
			})
		});
	}

	close() {
		return new Promise(async (resolve, reject) => {
			await this.waitNodeIsReady();
			this.sweep().then(()=>{
				channels.setAutoRefill(this.aa_address, 0, 0, ()=>{
					return resolve();
				});
			});
		});
	}
}

exports.Server = Server;
exports.Client = Client;