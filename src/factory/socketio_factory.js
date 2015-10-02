var io = require('socket.io');

function SocketIOFactory(){
    this.sio = null;
};
module.exports = SocketIOFactory;

SocketIOFactory.prototype.inject = function(httpServerFactory, properties, redisStoreFactory,
                                            sslConfig, prefixedLogger, gatewayWorker){
    this.httpServerFactory = httpServerFactory;
    this.redisStoreFactory = redisStoreFactory;
    this.properties = properties;
    this.ssl = sslConfig;
    this.logger = prefixedLogger;
    this.gatewayWorker = gatewayWorker;
};

/**
 * Creates and returns a socketio server
 * @returns {*}
 */
SocketIOFactory.prototype.instance = function(){
    if(!this.sio){
        var httpServer = this.httpServerFactory.instance();

        var options = {
            logger: this.logger.extendPrefix('socket.io')
        };

        if (this.ssl.useSsl) {
            options.key = this.ssl.key;
            options.cert = this.ssl.cert;
            options.ca = this.ssl.ca;
        }

        this.sio = io(httpServer, options);
        this.sio.set('heartbeat timeout', this.properties['gateway.socketio.timeout']);
        this.sio.set('heartbeat interval', this.properties['gateway.socketio.interval']);
        this.sio.set('transports', ['websocket', 'flashsocket']);
        this.sio.adapter(this.redisStoreFactory.instance());

        // Start the Flash Policy Server
        //this.sio.flashPolicyServer.on('error', this.gatewayWorker.createErrorHandler('Flash Policy Server'));

    }

    return this.sio;
};