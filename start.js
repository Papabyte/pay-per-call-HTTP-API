
const channels = require("aa-channels-lib");
const eventBus = require("ocore/event_bus.js");

var isHeadlessReady = false;

eventBus.on('headless_wallet_ready', function(){
	isHeadlessReady = true;
});

class Server {
	constructor(endPoints, port) {
		this.endPoints = endPoints;
		this.port = port;
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
			// paid amount and price matches, we execute result callback and send data to peer
			this.endPoints[endPoint](amount, asset, arrAguments, function(error, result, refunded_amount) {
				if (error) {
					channels.getPaymentPackage(amount, aa_address, function(error, objPaymentPackage){
						return handle({error: error, refund: objPaymentPackage});
					});
				} else {
					if (refunded_amount > 0){
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
						this.aa_address = aa_address
					});
				} else {
					this.aa_address = aa_addresses[0];
					return resolve();
				}
			});
		});
	}

	call(endpoint, amount, arrArguments){
		return new Promise((resolve, reject) => {

			if (!Array.isArray(arrArguments))
				return reject("arrArguments must be an array");
			channels.sendMessageAndPay(this.aa_address, [endpoint].concat(arrArguments), amount, (error, response)=>{

				if (error){
					if (error.refund){
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
					if (response.refund){
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
}

exports.Server = Server;
exports.Client = Client;