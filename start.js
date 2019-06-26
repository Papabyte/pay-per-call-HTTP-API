"use strict";

const eventBus = require('ocore/event_bus.js');

const Server = require('./server');


eventBus.on('headless_wallet_ready', function(){

	const server = new Server(3000);

});
