'use strict';

module.exports = GatewayWorker;

function GatewayWorker(){
    this.logger = null;
    this.properties = null;
    this.currentClientQueueLength = 0;
    this.exiting = false;
    this.restartOnClientQueueEmpty = false;
    this.stopOnClientQueueEmpty = false;
}

GatewayWorker.prototype.inject = function(prefixedLogger, properties, gateway){
    this.logger = prefixedLogger;
    this.properties = properties;
    this.gateway = gateway;
};

GatewayWorker.prototype.isExiting = function(){
    return this.exiting;
};

GatewayWorker.prototype.checkMemoryUsage = function () {
    var memoryUsage = process.memoryUsage();
    var megabyte = 1024 * 1024;
    for (var type in memoryUsage) {
        var limit = this.properties['cluster.memoryLimit.' + type];
        var warning = this.properties['cluster.memoryWarning.' + type];
        if (limit && (memoryUsage[type] > limit * megabyte)) {
            this.logger.error('Worker exceeded hard ' + type + ' memory limit (' +
            memoryUsage[type] + '/' + limit * megabyte + ')!');
        }
        if (warning && (memoryUsage[type] > warning * megabyte)) {
            this.logger.warn('Worker exceeded soft ' + type + ' memory limit (' +
            memoryUsage[type] + '/' + warning * megabyte + ')!');
        }
    }
};

GatewayWorker.prototype.sendMessage = function(message) {
    this.logger.debug('Received message from service');
    if (message) {
        if (message.command === 'clientQueueLength') {
            this.currentClientQueueLength = message.data;
            if (this.restartOnClientQueueEmpty && this.currentClientQueueLength <= 0) {
                this.logger.info('Client Queue is Empty: RESTARTING');
                process.send({command: 'restart'});
            }
            else if (this.stopOnClientQueueEmpty && this.currentClientQueueLength <= 0) {
                this.logger.info('Client Queue is Empty: STOPPING');
                process.send({command: 'stop'});
            }
        }
    }
};


GatewayWorker.prototype.onMessageStopOrRestart = function(msg){
    var cmd = msg.cmd;
    var type = msg.type;
    var data = parseInt(msg.data);
    this.logger.info('server received '+msg.cmd+' message: ' + type);
    if (type.toLowerCase() === 'on_client_queue_empty') {

        this.gateway.onShutdown(type);
        if (this.currentClientQueueLength <= 0) {
            process.send({command: cmd});
        }
        else {
            if(cmd == 'stop')
                this.stopOnClientQueueEmpty = true;
            else if(cmd == 'restart')
                this.restartOnClientQueueEmpty = true;

            if (data) {
                // Set the timeout to restart this server process.
                this.logger.info(cmd+' request received. ' + this.currentClientQueueLength + ' client(s) currently connected. Setting '+cmd+' timeout to ' + data);
                setTimeout(function () {
                    this.logger.warn('Server '+cmd+' timeout, stopping process with ' + this.currentClientQueueLength + ' connected client(s)');
                    process.send({command: cmd});
                }.bind(this), data);
            }
        }
    }
    else {
        process.send({command: cmd});
    }
};

GatewayWorker.prototype.onMessageLogLevel = function(msg){
    throw new Error('NOT IMPLEMENTED');
    //var logLevel = msg.data;
    //this.logger.info('Setting LogLevel to ' + logLevel);
    //logger.remove(winston.transports.Console);
    //logger.add(winston.transports.Console, {level: logLevel});
};

GatewayWorker.prototype.onMessageCMSI = function(msg){
    var clientMessageResendInterval = msg.data;
    this.logger.info('Setting clientMessageResendInterval to ' + clientMessageResendInterval);
    this.properties['frontend.clientMessageResendInterval'] = clientMessageResendInterval;
};

GatewayWorker.prototype.onMessageClientCount = function(msg){
    this.logger.info('Getting clientCount: ' + this.currentClientQueueLength + ' client(s) currently connected');
    process.send({command: 'clientCount', data: this.currentClientQueueLength});
};

GatewayWorker.prototype.onProcessMessage = function (msg) {
    var command = msg.cmd.toLowerCase();
    switch(command){
        case 'restart':
            this.onMessageStopOrRestart(msg);
            break;
        case 'stop':
            this.onMessageStopOrRestart(msg);
            break;
        case 'loglevel':
            this.onMessageLogLevel(msg);
            break;
        case 'clientmessageresendinterval':
            this.onMessageCMSI(msg);
            break;
        case 'clientcount':
            this.onMessageClientCount(msg);
            break;
        default:
            this.logger.info('server received unknown message: ' + JSON.stringify(msg));
            break;
    }
};

GatewayWorker.prototype.createErrorHandler = function createErrorHandler(source) {
    return function (error) {
        this.logger.error('Fatal ' + source + ' error: ', error.stack);

        clearInterval(this.heartbeat);
        if (process.send && !this.exiting) {
            this.catchAndWarn('master communication channel', function () {
                process.send({command: 'disconnect'});
            });
        }

        this.gateway.handleError(error, source);

        this.exiting = true;
    }.bind(this);
};

GatewayWorker.prototype.catchAndWarn = function catchAndWarn(connection, cleanup) {
    try {
        cleanup();
    } catch (error) {
        if (!this.exiting) {
            this.logger.warn('Error disconnecting ' + connection + ' (' +error.toString() + ')');
        }
    }
};

GatewayWorker.prototype.startHeartbeartPoller = function(){
    if (process.send) {
        this.heartbeat = setInterval(function () {
            process.send({command: 'heartbeat', memory: process.memoryUsage()});
        }, this.properties['cluster.heartbeatInterval']);
    }
};

GatewayWorker.prototype.startMemoryUsagePoller = function(){
    setInterval(function () {
        try {
            this.checkMemoryUsage();
        } catch (error) {
            this.logger.info(error);
        }
    }.bind(this), 1000);
};

GatewayWorker.prototype.start = function() {
    process.on('message', this.onProcessMessage.bind(this));
    this.startHeartbeartPoller();
    this.startMemoryUsagePoller();

    this.gateway.start();
};


