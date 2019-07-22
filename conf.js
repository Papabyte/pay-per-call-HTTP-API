exports.bServeAsHub = false;
exports.bLight = true;
exports.bSingleAddress = true;

exports.WS_PROTOCOL = "ws://";
exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'API server';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = [''];


exports.isHighAvaibilityNode =  false;

exports.enabledComLayers = ['http'];

exports.isHttpServer = true;
exports.httpDefaultPort = 6800;

console.log('API server');
