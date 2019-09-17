
const channels = require("aa-channels-lib");
const eventBus = require("ocore/event_bus.js");
const validationUtils = require('ocore/validation_utils.js');
const db = require('ocore/db.js');

var isHeadlessReady = false;

eventBus.on('headless_wallet_ready', function(){
	isHeadlessReady = true;
});

class Server {
	constructor(endPoints, port, sweepingPeriod) {
		this.endPoints = endPoints;
		this.port = port;
		this.sweepingPeriod = sweepingPeriod;
	}

	startWhenReady(){
		return new Promise((resolve, error) => {
			if (isHeadlessReady){
				this.start();
				return resolve();
			} else {
				eventBus.on('headless_wallet_ready', ()=>{
					this.start();
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
			this.endPoints[endPoint](amount, asset, arrAguments, function(error, result, refunded_amount) {
				if (error) {
					channels.getPaymentPackage(amount, aa_address, function(error, objPaymentPackage){
						return handle({error: error, refund: objPaymentPackage});
					});
				} else {
					if (refunded_amount > 0){ // if we were instructed to send a refund, we get the corresponding payment package
						channels.getPaymentPackage(amount, aa_address, function(error, objPaymentPackage){
							if (error)
								return handle({result: result});
							else
								return handle({result: result, refund: objPaymentPackage});
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

	sweepChannelsIfPeriodExpired(sweepingPeriod){
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
	}

	startWhenReady(){
		return new Promise((resolve, error) => {
			if (isHeadlessReady){
				setTimeout(()=>{
					this.start().then(resolve, error);
				}, 2000);
			}
			else {
				eventBus.on('headless_wallet_ready', ()=>{
					setTimeout(()=>{
						this.start().then(resolve, error);
					}, 2000);				
				});
			}
		})
	}

	start(){
		return new Promise((resolve, reject) => {
			channels.getChannelsForPeer(this.peer_url, null, (error, aa_addresses) => {
				if (error) {
					console.log("no channel found for this peer, I'll create one");
					channels.createNewChannel(this.peer_url, this.fill_amount, {
						salt: true,
						asset: this.asset
					}, (error, aa_address)=>{
						if (error)
							return reject(error);
						this.aa_address = aa_address;
						channels.setAutoRefill(aa_address, this.fill_amount, this.refill_threshold, ()=>{});
					});
				} else {
					this.aa_address = aa_addresses[0];
					channels.setAutoRefill(aa_addresses[0], this.fill_amount, this.refill_threshold, ()=>{});
					return resolve();
				}
			});
		});
	}

	call(endpoint, amount, arrArguments){
		return new Promise((resolve, reject) => {

			if (!validationUtils.isPositiveInteger(amount))
				return reject("amount must be a positive integer");
			if (!Array.isArray(arrArguments))
				return reject("arrArguments must be an array");

			channels.sendMessageAndPay(this.aa_address, [endpoint].concat(arrArguments), amount, (error, response)=>{

				if (error){
					if (error.refund){ // alongside with error a refund has been returned, we verify its payment package
						channels.verifyPaymentPackage(error.refund, function(verification_error, amount){
							if (verification_error){
								return resolve({
									error: error + ", error while verifying refund:  " + verification_error,
									refunded_amount: 0
								});
							} else {
								return resolve({
									error: error,
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
						channels.verifyPaymentPackage(error.refund, function(verification_error, amount){
							if (verification_error){
								return resolve({
									error: verification_error,
									result: response.result,
									refunded_amount: 0
								});
							} else {
								return resolve({
									result: response.result,
									refunded_amount: amount
								});
							}
						});
					} else {
						return resolve({
							result: response.result,
							refunded_amount: amount
						});
					}
				}
			});
		});
	}

	sweep() {
		return new Promise((resolve) => {
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
		return new Promise((resolve) => {
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