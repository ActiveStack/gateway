'use strict';

var io = require('socket.io');
var Client = require('./client');
var RedisStore = require('socket.io/lib/stores/redis');

module.exports = Gateway;

/**
 * This gateway program serves http requests for the browser client and
 * supporting files.  It also serves as the real-time socket connection for all
 * clients using the socket.io (websockets) protocol.
 *
 */
function Gateway() {

    this.httpServer     = null;
    this.properties     = null;
    this.ssl            = null;
    this.logger         = null;
    this.rabbitmq       = null;
    this.exchange       = null;
    this.sio            = null;
    this.redisStore     = null;
    this.sockets        = {};
    this.clients        = {};
}

Gateway.prototype.inject = function(httpServerFactory, properties, sslConfig, prefixedLogger,
        redisStoreFactory, socketioFactory, rabbitmqFactory, gatewayWorker, sessionFactory){
    this.httpServerFactory  = httpServerFactory;
    this.properties         = properties;
    this.ssl                = sslConfig;
    this.logger             = prefixedLogger;
    this.redisStoreFactory  = redisStoreFactory;
    this.socketioFactory    = socketioFactory;
    this.rabbitmqFactory    = rabbitmqFactory;
    this.gatewayWorker      = gatewayWorker;
    this.sessionFactory     = sessionFactory;
};

Gateway.prototype.init = function(){
    this.initHttpServer();
    this.initRedis();
    this.initSocketIO();
    this.initRabbitMQ();
};

Gateway.prototype.initHttpServer = function(){
    this.httpServer = this.httpServerFactory.instance();
    this.httpServer.on('error', this.gatewayWorker.createErrorHandler('HTTP Server'));
};

Gateway.prototype.initRedis = function() {
    this.redisStore = this.redisStoreFactory.instance();

    this.attachRedisErrorHandlers('Publisher', this.redisStore.pub);
    this.attachRedisErrorHandlers('Subscriber', this.redisStore.sub);
    this.attachRedisErrorHandlers('Client', this.redisStore.cmd);
};

Gateway.prototype.initSocketIO = function() {
    this.sio = this.socketioFactory.instance();
};

/**
 * Initialize RabbitMQ connection
 */
Gateway.prototype.initRabbitMQ = function() {
    this.rabbitmq = this.rabbitmqFactory.create();
    this.rabbitmq.on('ready', this.onRabbitReady.bind(this));
};

Gateway.prototype.onRabbitReady = function () {
    this.logger.debug("RabbitMQ connection ready");
    var durable = this.properties['gateway.rabbitmq.durable'] == 'true';
    var options = {autoDelete: false, durable: durable, confirm: true};
    this.exchange = this.rabbitmq.exchange('', options);

    this.exchange.on('error', this.gatewayWorker.createErrorHandler('RabbitMQ Exchange'));

    // Handles a new client socket connection.
    this.sio.sockets.on('connection',this.onSocketConnection.bind(this));

    this.rabbitmq.on('error', this.gatewayWorker.createErrorHandler('RabbitMQ'));
}

Gateway.prototype.onSocketEnd = function (socket, isServerTerminated) {
    var client = this.clients[socket.id];
    if (client) {
        client.isServerTerminated = isServerTerminated;
    }

    socket.removeAllListeners('logout');
    socket.removeAllListeners('disconnect');

    delete this.sockets[socket.id];

    if (client) {
        client.removeAllListeners('dispose');
        client.dispose();
    }

    delete this.clients[socket.id];

    this.logger.info('[End] Connected clients: ' + Object.keys(this.sockets).length);
    try {
        this.gatewayWorker.sendMessage({
            command: 'clientQueueLength',
            data: (!this.sockets || Object.keys(this.sockets).length <= 0) ? 0 : Object.keys(this.sockets).length
        });
    } catch (error) {}
};

Gateway.prototype.onSocketDisconnect = function (socket, reason, isServerTerminated) {
    this.logger.info('Socket Disconnected, reason: ' + reason + ', Server Terminated: ' + (isServerTerminated ? 'TRUE' : 'FALSE'));
    this.onSocketEnd(socket, isServerTerminated);
    this.logger.info('[Disconnect] Connected clients: ' + Object.keys(this.sockets).length);
};

Gateway.prototype.onSocketLogout = function (socket, isServerTerminated) {
    this.logger.info('[Logout] Connected clients: ' + Object.keys(this.sockets).length);
    socket.disconnect('Client Logout');
};

Gateway.prototype.onClientDispose = function (socket, isServerTerminated) {
    // The client has had some issue which makes it no longer valid so it needs to be disposed of.
    //this.onSocketDisconnect(socket, 'Client Disposed', isServerTerminated);
    socket.disconnect();
};

/**
 * TODO: Move logout, disconnect handlers to Client
 * @param socket
 */
Gateway.prototype.onSocketConnection = function (socket) {
    this.sockets[socket.id] = socket;
    this.logger.info('Connected clients: ' + Object.keys(this.sockets).length);

    try {
        this.gatewayWorker.sendMessage({command: 'clientQueueLength', data: Object.keys(this.sockets).length});
    } catch (error) {}

    socket.on('disconnect', this.onSocketDisconnect.bind(this, socket));
    socket.on('logout', this.onSocketLogout.bind(this, socket));

    var newClient = new Client(socket, this.exchange, this.rabbitmq, this.logger, this.properties, this.sessionFactory);
    this.clients[socket.id] = newClient;

    newClient.on('dispose', this.onClientDispose.bind(this, socket));
};


Gateway.prototype.handleError = function(error, source) {
    var catchAndWarn = this.gatewayWorker.catchAndWarn;

    catchAndWarn('RabbitMQ', function() { this.rabbitmq.end();}.bind(this));

    this.trapRedisCleanup('Publisher', this.redisStore.pub);
    this.trapRedisCleanup('Subscriber', this.redisStore.sub);
    this.trapRedisCleanup('Client', this.redisStore.cmd);

    catchAndWarn('Flash Policy Server', function() {
        this.sio.flashPolicyServer.close();
    }.bind(this));

    catchAndWarn('Socket IO clients', function() {
        Object.keys(this.sockets).forEach(function(id) {
            this.sockets[id].disconnect();
        }.bind(this));
    }.bind(this));

    this.httpServer.close();
};
	
Gateway.prototype.onShutdown = function(shutdownType) {
    this.logger.info('Closing down Socket IO Server');

    this.gatewayWorker.catchAndWarn('Socket IO Server', function() {
        this.sio.server.close();
    }.bind(this));
};

	// RedisClient resists proper error handling :-(
Gateway.prototype.attachRedisErrorHandlers = function(type, redis) {
    var handler = this.gatewayWorker.createErrorHandler('Redis Store ' + type);
    redis.on('error', handler);

    // If the server shuts down we get an "end" instead of an error.
    redis.on('end', handler.bind(null, { stack: 'Unexpected close.' }));
};

// RedisClient resists proper error handling :-(
Gateway.prototype.trapRedisCleanup = function(type, redis) {
    this.gatewayWorker.catchAndWarn('Redis Store ' + type, function() {
        redis.end();  // This call wipes all event handlers!
        redis.stream.on('error', function(error) {
            this.logger.warn('Error disconnecting Redis Store ' + type + ' (' +
            error.toString() + ')');
        });
    }.bind(this));
};

Gateway.prototype.start = function(){
    this.httpServer.listen(
        this.properties['frontend.port'],
        this.properties['frontend.host'],
        function () {
            this.logger.info('Gateway ready on http' + (this.useSsl ? 's' : '') + '://' +
                (this.properties['frontend.host'] || '*') + ':' + (this.properties['frontend.port']));
        }.bind(this)
    );
};

