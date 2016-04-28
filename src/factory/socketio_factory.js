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
        if (this.ssl.useSsl) {
            this.sio = io.listen(httpServer, {
                logger: this.logger.extendPrefix('socket.io'),
                key: this.ssl.key,
                cert: this.ssl.cert,
                ca: this.ssl.ca
            });
        }
        else {
            this.sio = io.listen(httpServer, {logger: this.logger.extendPrefix('socket.io')});
        }

        var redisStore = this.redisStoreFactory.instance();
        this.sio.configure(function () {
            this.sio.set('heartbeat timeout', this.properties['gateway.socketio.timeout']);
            this.sio.set('heartbeat interval', this.properties['gateway.socketio.interval']);
            this.sio.set('transports', ['websocket', 'flashsocket']);
            this.sio.set('store', redisStore);
        }.bind(this));

        // Start the Flash Policy Server
        this.sio.flashPolicyServer.on('error', this.gatewayWorker.createErrorHandler('Flash Policy Server'));

    }

    return this.sio;
};