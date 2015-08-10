'use strict';

var cluster  = require('cluster'),
    os       = require('os'),
    redis    = require('redis'),
    fs       = require('fs'),
    MEGABYTE = 1024 * 1024,
    PACKAGE_INFO = JSON.parse(fs.readFileSync(__dirname+'/../package.json'));

module.exports = GatewayServer;
function GatewayServer() {
    this.workers                = [];
    this.shuttingDown           = false;
    this.properties             = null;
    this.logger                 = null;
    this.consecutiveFailures    = 0;
    this.workerCount            = 0;
}

GatewayServer.prototype.inject = function(prefixedLogger, properties, gatewayWorker){
    this.logger = prefixedLogger;
    this.properties = properties;
    this.worker = gatewayWorker;
};

GatewayServer.prototype.start = function(){

    var cpuCount = os.cpus().length;
    this.workerCount = this.properties['cluster.workerCount'] || cpuCount / 2 + 1;

    if(cluster.isMaster){
        this.logger.info('\n**************************** ACTIVESTACK GATEWAY SERVER: v' + PACKAGE_INFO['version'] + ' ' + PACKAGE_INFO['release_date'] + ' ****************************\n');
        this.logger.info('CPU count: ' + cpuCount);
        this.logger.info('Worker count: ' + this.workerCount);
    }

    if (this.isMaster() && this.workerCount > 1)
        this.startMaster();
    else
        this.startWorker();

};

/**
 * Broke this function out so that we could mock it in tests
 * @returns {boolean}
 */
GatewayServer.prototype.isMaster = function(){
    return cluster.isMaster;
};

GatewayServer.prototype.startMaster = function(){
    this.setupIPC();

    for (var i = 0; i < this.workerCount; ++i) {
        this.createWorkerProcess();
    }
};

/**
 * Setup the inter-process communication controls
 */
GatewayServer.prototype.setupIPC = function(){
    try {
        var gatewayControlQueue = this.properties['gateway.redis.gatewaycontrolqueue'];
        if (!gatewayControlQueue)
            gatewayControlQueue = 'gateway';

        var client = redis.createClient(this.properties['gateway.redis.port'], this.properties['gateway.redis.host']);
        if (this.properties['gateway.redis.password']) {
            client.auth(this.properties['gateway.redis.password'], function(error, result) {
                if (error)
                    this.logger.info('ERROR connecting to redis: ' + error);
                else
                    this.logger.info('SUCCESSFULLY connected to redis');
            }.bind(this));
        }

        client.on("error", function (err) {
            this.logger.info("Error " + err);
        }.bind(this));

        client.on("message", this.onIPCMessage.bind(this));

        client.subscribe(gatewayControlQueue);
    } catch(redisError) {
        this.logger.info('REDIS ERROR: Unable to connect to redis queue: ' + redisError);
    }
};

/**
 * Callback for when the process gets a message on the IPC channel
 */
GatewayServer.prototype.onIPCMessage = function (channel, message) {
    try {
        var messageName = message.toLowerCase().trim();
        var params = message.toLowerCase().trim().split(' ');

        // TODO: Add workerCount message
        switch (messageName) {
            case 'loglevel':
                this.onIPCLogLevel(params);
                break;
            case 'clientmessageresendinterval':
                this.onIPCClientMessageResendInterval(params);
                break;
            case 'clientcount':
                this.onIPCClientCount();
                break;
            case 'restart':
                this.onIPCRestart(params);
                break;
            case 'shutdown':
                this.onIPCShutdown(params);
                break;
            default:
                this.logger.info("Received Redis unknown message: " + channel + ": " + message);
                break;
        }
    } catch(error) {
        this.logger.info('EXCEPTION: ' + error);
    }
}

/**
 * Handler function of IPC 'shutdown'
 * @param params {Object}
 */
GatewayServer.prototype.onIPCShutdown = function(params){
    this.logger.info('Processing SHUTDOWN message');
    this.shuttingDown = true;
    var stopCode;
    if (params.length > 1) {
        stopCode = params[1];
    }

    if (stopCode != this.properties['frontend.shutdownCode']) {
        this.logger.info('\n************************ INVALID SHUTDOWN CODE RECEIVED!!! ************************\n');
        return;
    }
    var stopType = 'immediate';
    if (params.length > 2) {
        stopType = params[2];
    }
    var stopTimeout;
    if (params.length > 3)
        stopTimeout = parseInt(params[3]);
    this.stopWorkerProcesses(stopType, stopTimeout);
}

/**
 * Handler function of IPC 'restart'
 * @param params {Object}
 */
GatewayServer.prototype.onIPCRestart = function(params){
    this.logger.info('Processing RESTART message');
    var restartType = 'immediate';
    if (params.length > 1) {
        restartType = params[1];
    }
    var restartInterval;
    if (params.length > 2)
        restartInterval = parseInt(params[2]);
    this.restartWorkerProcesses(restartType, restartInterval);
};

/**
 * Handler function of IPC 'clientcount'
 */
GatewayServer.prototype.onIPCClientCount = function(){
    this.logger.info('Processing CLIENTCOUNT message');
    this.getClientCount();
};

/**
 * Handler function of IPC 'clientmessageresendinterval'
 * @param params {Object}
 */
GatewayServer.prototype.onIPCClientMessageResendInterval = function(params){
    this.logger.info('Processing CLIENTMESSAGERESENDINTERVAL message');

    var clientMessageResendInterval = this.properties['frontend.clientMessageResendInterval'];
    if (params.length > 1) {
        clientMessageResendInterval = params[1];
    }
    this.setClientMessageResendInterval(clientMessageResendInterval);
};

/**
 * Handler function of IPC 'loglevel'
 * @param params {Object}
 */
GatewayServer.prototype.onIPCLogLevel = function(params){
    this.logger.info('Processing LOGLEVEL message');
    var logLevel = this.properties['frontend.logLevel'];
    if (params.length > 1) {
        logLevel = params[1];
    }
    this.setLogLevel(logLevel);
};

GatewayServer.prototype.startWorker = function(){
    this.worker.start();
};

GatewayServer.prototype.restartWorkerProcesses = function(restartType, restartInterval) {
    var oldWorkers = this.workers;
    this.workers = [];
    this.logger.info('Restarting processes - ' + restartType.toUpperCase());

    if (restartType.toLowerCase() === 'immediate') {
        if (!restartInterval)
            restartInterval = 500;
        this.logger.info('Restarting processes at ' + restartInterval + 'ms intervals');
        for(var j=0; j<oldWorkers.length; j++) {
            // Force it to stop. When the onEnd function runs it will restart it
            this.hardStopWorkerProcess(oldWorkers[j],j * restartInterval);
        }
    }
    else {
        for(var j=0; j<oldWorkers.length; j++) {
            this.logger.info('sending timeout ' + restartInterval);
            oldWorkers[j].send({cmd: 'restart', type: 'on_client_queue_empty', data: restartInterval});
        }
    }
}

GatewayServer.prototype.hardStopWorkerProcess = function(worker, delay){
    var hardStop = function(){
        try {
            worker.disconnect();
            worker.destroy();
        } catch (e) {
            this.logger.info('Could not stop worker: ' + e);
        }
    }.bind(this);

    if(delay && delay > 0)
        setTimeout(hardStop, delay);
    else
        hardStop();
};

GatewayServer.prototype.stopAndRemoveWorkerProcess = function(worker, delay){
    for(var i = 0; i < this.workers.length; i++) {
        if (this.workers[i] === worker) {
            this.workers.splice(i, 1);
            break;
        }
    }
    this.hardStopWorkerProcess(worker, delay);
};

GatewayServer.prototype.sendMessageToWorkers = function(message){
    for(var j = 0; j < this.workers.length; j++) {
        try {
            if (this.workers[j]) {
                this.workers[j].send(message);
            }
        } catch(error) {
            this.logger.info('Unable to set logLevel: ' + error);
        }
    }
};

GatewayServer.prototype.stopWorkerProcesses = function(stopType, stopTimeout) {
    this.logger.info('Stopping processes - ' + stopType.toUpperCase());

    if (stopType.toLowerCase() === 'immediate') {
        for(var j = 0; j < this.workers.length; j++) {
            this.hardStopWorkerProcess(this.workers[j]);
        }
        process.exit();
    }
    else {
        this.sendMessageToWorkers({cmd: 'stop', type: 'on_client_queue_empty', data: stopTimeout});
    }
};

GatewayServer.prototype.setLogLevel = function(logLevel) {
    this.logger.info('Setting LogLevel - ' + logLevel.toUpperCase());
    this.sendMessageToWorkers({cmd: 'logLevel', data: logLevel});
};

GatewayServer.prototype.setClientMessageResendInterval = function(clientMessageResendInterval) {
    this.logger.info('Setting clientMessageResendInterval - ' + clientMessageResendInterval);
    this.sendMessageToWorkers({cmd: 'clientMessageResendInterval', data: clientMessageResendInterval});
};

GatewayServer.prototype.getClientCount = function() {
    this.logger.info('Getting clientCount');
    this.sendMessageToWorkers({cmd: 'clientCount'});
};

GatewayServer.prototype.resetWorkerRestartDelay = function() {
    this.consecutiveFailures = 0;
};

GatewayServer.prototype.getNextWorkerRestartDelay = function() {
    var failureCount = Math.min(this.consecutiveFailures++, this.properties['cluster.maxRestartBackoff']);
    var factor = Math.random() * (Math.pow(2, failureCount) - 1);
    return factor * this.properties['cluster.workerRestartDelay'];
};

GatewayServer.prototype.onWorkerProcessOnline = function(worker) {
    this.logger.info('Worker online: ' + worker.process.pid);
    worker.lastHeartbeat = Date.now();
    worker.watchdog = setInterval(function() {
        var time = Date.now();
        if (worker.lastHeartbeat + this.properties['cluster.workerTimeout'] < time) {
            this.logger.info('Worker heartbeat stopped, destroying worker: ' + worker.process.pid);

            this.stopAndRemoveWorkerProcess(worker);
        }
    }.bind(this), this.properties['cluster.watchdogInterval']);
};

GatewayServer.prototype.onWorkerProcessMessageHeartbeat = function(worker, message){
    if (!worker.gotFirstHeartbeat) {
        worker.gotFirstHeartbeat = true;
        this.resetWorkerRestartDelay();
    }

    worker.lastHeartbeat = Date.now();
    for (var type in message.memory) {
        var limit = this.properties['cluster.memoryLimit.' + type];
        var warning = this.properties['cluster.memoryWarning.' + type];
        if (limit && (message.memory[type] > limit * MEGABYTE)) {
            this.logger.info('Worker exceeded hard ' + type + ' memory limit (' +
                message.memory[type] + '/' + limit * MEGABYTE + ')!');
            this.stopAndRemoveWorkerProcess(worker);
        }

        if (warning && (message.memory[type] > warning * MEGABYTE)) {
            this.logger.info('Worker exceeded soft ' + type + ' memory limit (' +
                message.memory[type] + '/' + warning * MEGABYTE + ')!');
        }
    }
};

GatewayServer.prototype.onWorkerProcessMessageDisconnect = function(worker, message){
    this.stopAndRemoveWorkerProcess(worker);
};

GatewayServer.prototype.onWorkerProcessMessageStop = function(worker, message){
    this.logger.info('STOPPING worker ' + worker.process.pid);
    this.stopAndRemoveWorkerProcess(worker);

    if (this.workers.length <= 0) {
        this.logger.info('Exiting process');
        process.exit();
    }
};

GatewayServer.prototype.onWorkerProcessMessageRestart = function(worker, message){
    this.logger.info('RESTARTING worker ' + worker.process.pid);
    this.stopAndRemoveWorkerProcess(worker);
    // After the worker is destroyed, the on 'exit' handler will pick up the
    // event and automatically restart the worker.
};

GatewayServer.prototype.onWorkerProcessMessageClientCount = function(worker, message){
    // Report the clientCount.
    this.logger.info('ClientCount ' + worker.process.pid + ': ' + message.data);
};


GatewayServer.prototype.onWorkerProcessMessage = function(worker, message) {
    switch(message.command){
        case 'heartbeat':
            this.onWorkerProcessMessageHeartbeat(worker, message);
            break;
        case 'disconnect':
            this.onWorkerProcessMessageDisconnect(worker, message);
            break;
        case 'stop':
            this.onWorkerProcessMessageStop(worker, message);
            break;
        case 'restart':
            this.onWorkerProcessMessageRestart(worker, message);
            break;
        case 'clientCount':
            this.onWorkerProcessMessageClientCount(worker, message);
            break;
        default:
            this.logger.info('Unknown worker message: ', message);
            break;
    }
};

GatewayServer.prototype.onWorkerProcessExit = function(worker, code, signal) {
    this.logger.info('Worker ' + worker.process.pid + ' died (code:' + code + ', signal:' +
        (signal || 'none') + ').  Starting replacement...');
    clearInterval(worker.watchdog);

    for(var i = 0; i < this.workers.length; i++) {
        if (this.workers[i] === worker) {
            this.workers.splice(i, 1);
            break;
        }
    }

    setTimeout(this.createWorkerProcess.bind(this), this.getNextWorkerRestartDelay());
};

GatewayServer.prototype.createWorkerProcess = function(forceCreate) {
    if (this.shuttingDown) {
        this.logger.info('Shutting down, not restarting worker.');
        return;
    }

    if (this.workerCount <= this.workers.length) {
        if (!forceCreate) {
            // Only start another worker if forceCreate OR we have not yet reached our max number of worker threads.
            this.logger.info('Reached max num workers, ABORTING createWorkerProcess');
            return;
        }
        else {
            this.logger.info('Reached max num workers, FORCE createWorkerProcess');
        }
    }

    var worker = cluster.fork();
    worker.lastHeartbeat = null;
    worker.watchdog = null;
    worker.gotFirstHeartbeat = false;

    worker.on('online', this.onWorkerProcessOnline.bind(this, worker));
    worker.on('message', this.onWorkerProcessMessage.bind(this, worker));
    worker.on('exit', this.onWorkerProcessExit.bind(this, worker));

    this.workers.push(worker);
};
