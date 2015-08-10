'use strict';

var chain = require('../lib/chain');
var Client = require('../lib/client');
var crypto = require('crypto');
var cluster = require('cluster');
var os = require('os');

var properties = require('node-properties-parser').readSync(__dirname + '/../resources/env.properties');

var cpuCount = os.cpus().length;
var workerCount = (properties['test.workerCount'] || cpuCount / 2 + 1);
var workers = [];
var totalWorkersFinished = 0;

var clientCount = (properties['test.clientCount'] || parseInt(process.argv[2], 10));

var LISTENER_COUNT = Math.ceil(clientCount / workerCount);
//var LISTENER_COUNT = 2;
var PUT_COUNT = (properties['test.putCount'] || parseInt(process.argv[3], 10));// / workerCount;
//var PUT_COUNT = 2;
var name = process.argv[4] || '';
//var name = '';

var connectTimeLimit = (properties['test.connectTimeLimit'] || 120000);   // Two minutes

//var clientOptions = { host: 'qanode.psiglobaldb.com', port: 8080 };
var clientOptions = { host: (properties['test.host'] || 'localhost'), port: (properties['test.port'] || 8080) };
//var clientOptions = { host: 'ec2-54-242-65-246.compute-1.amazonaws.com', port: 8080 };

var authRequest = {
	accessToken: 'ya29.AHES6ZRaP50gzLxKgNgBPgsFte07isFs8dtSUWzeOGt-8PqYHLHpNKI',
	cn: 'com.percero.agents.auth.vo.AuthenticateOAuthAccessTokenRequest',
	redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
	refreshToken: 'ANON',
	regAppKey: 'PSI_29V97G',
	//svcOauthKey: '718060161923.apps.googleusercontent.com',
	authProvider: 'ANON'
};

var logoutRequest = {
    cn: 'com.percero.agents.sync.vo.LogoutRequest',
    pleaseDestroyClient: true
}

var getPersonsRequest = {
	cn: 'com.percero.agents.sync.vo.GetAllByNameRequest',
	theClassName: 'com.psiglobal.mo.CropType'
};

var putPersonRequest = {
	cn: 'com.percero.agents.sync.vo.PutRequest',
	theObject: {
		cn: 'com.psiglobal.mo.CropType',
		ID: crypto.randomBytes(16).toString('hex'),
		name: 'Test Crop'
	}
};

var connectionsDisplayCount = Math.ceil(LISTENER_COUNT / 20);
var updatesReceivedDisplayCount = Math.ceil(LISTENER_COUNT * PUT_COUNT / 20);
var deletesReceivedDisplayCount = Math.ceil(PUT_COUNT / 5);

var setupClient = function() {
    var client = new Client(clientOptions);
    clients.push(client);

    client.on('sync#PushUpdateResponse', function(message) {
        process.send({totalUpdates: 1});
        if ((message.objectList[0].ID == putPersonRequest.theObject.ID) && (++totalUpdates % updatesReceivedDisplayCount == 0)) {
            log('Total PushUpdateResponses: ' + totalUpdates);
        }
    });

    client.on('sync#PushDeleteResponse', function(message) {
        process.send({totalDeletes: 1});
        if ((message.objectList[0].ID == putPersonRequest.theObject.ID) && (++totalDeletes % deletesReceivedDisplayCount == 0)) {
            log('Total PushDeleteResponses: ' + totalDeletes);
        }
    });

    client.on('disconnect', function() {
        if (!finished) {
            log('Client disconnected prematurely.');
        }
    });

    client.connectTimeoutHandler = function() {
        var existingRetryClient = retryClients[client.connectTimeout];
        if (!existingRetryClient) {
            // Retry at least once...
            client.connectTimeout = setTimeout(client.connectTimeoutHandler, connectTimeLimit);
            retryClients[client.connectTimeout] = client;
        }
        else {
            delete retryClients[client.connectTimeout];
            notReadyListeners++;
            process.send({notReadyListeners: 1});
            log('Connect Failed: ' + notReadyListeners + ' / ' + readyListeners + ' | ' + LISTENER_COUNT);
            if (!putsSent && (readyListeners + notReadyListeners) == LISTENER_COUNT) {
                log(readyListeners + ' of ' + LISTENER_COUNT + ' listeners ready.');
                sendPuts();
                putsSent = true;
                //delete listeners[client];
            }
        }
    };
};

var connectClient = function (client, callback) {
    chain([
        function (next) {
            client.connectTimeout = setTimeout(client.connectTimeoutHandler, connectTimeLimit);
            client.connect(next);
        },
        function (next) {
            if (client.connectTimeout) {
                clearTimeout(client.connectTimeout);
            }
            socketIoConnects++;
            process.send({socketIoConnects: 1});
            if ((socketIoConnects % connectionsDisplayCount) == 0 || socketIoConnects >= LISTENER_COUNT) {
//                    console.log('Socket IO Connects: ' + socketIoConnects);
//                process.send({socketIoConnects: socketIoConnects});
            }
            client.sendSpecialMessage('connect', true);
            setTimeout(function () {
                //authRequest.deviceId = crypto.randomBytes(16).toString('hex');
                client.sendRequest('authenticateOAuthAccessToken', authRequest, next);
            }, 25);
        },
        function (next, message) {
            perceroConnects++;
            process.send({perceroConnects: 1});
            if ((perceroConnects % connectionsDisplayCount) == 0 || perceroConnects >= LISTENER_COUNT) {
//                    console.log('Percero Connects: ' + perceroConnects);
            }
            client.on('sync#ConnectResponse', next);
        },
        function (next, message) {
            client.sendRequest('getAllByName', getPersonsRequest, next);
        },
        function () {
            try {
                delete retryClients[connectTimeout];
                clearTimeout(connectTimeout);
            } catch (e) {
            }

            if (!putsSent) {
                readyListeners++;
                process.send({readyListeners: 1});
                listeners.push(client);
                connectedClients.push(client);
                if (callback) {
                    callback();
                }
            }
        }
    ]);
};



if (cluster.isMaster) {
    console.log('CPU count: ' + cpuCount);
    console.log('Worker count: ' + workerCount);
    console.log('LISTENER COUNT: ' + (LISTENER_COUNT * workerCount) + ' (' + LISTENER_COUNT + '/worker)');
    console.log('PUT COUNT: ' + PUT_COUNT);


    var socketIoConnects = 0;
    var perceroConnects = 0;
    var readyListeners = 0;
    var notReadyListeners = 0;
    var totalUpdates = 0;
    var totalDeletes = 0;

    for (var i = 0; i < workerCount; ++i) {
        createWorker();
    }
}
else {
    var socketIoConnects = 0;
    var perceroConnects = 0;
    var readyListeners = 0;
    var retryClients = {};
    var clients = [];
    var connectedClients = [];
    var notReadyListeners = 0;
    var listeners = [];
    var totalUpdates = 0;
    var totalDeletes = 0;
    var finished = false;
    var putsSent = false;

    console.log('Setting up Clients...');
    // Setup Clients
    for (var i = 0; i < LISTENER_COUNT; ++i) {
        setupClient();
    }

    console.log('Connecting up Clients...');
    var connectNextClient = function() {
        var clientToConnect = undefined;
        for(var i=0; i<clients.length; i++) {
            var nextClient = clients[i];
            var clientIsConnected = false;
            for(var j=0; j<connectedClients.length; j++) {
                if (nextClient === connectedClients[j]) {
                    clientIsConnected = true;
                    break;
                }
            }

            if (!clientIsConnected) {
                clientToConnect = nextClient;
                break;
            }
        }

        if (clientToConnect) {
            if (connectedClients.length % connectionsDisplayCount == 0) {
                console.log('Connecting client #' + (connectedClients.length+1));
            }
            connectClient(clientToConnect, connectNextClient);
        }
        else {
            console.log('Sending PUTS');
            sendPuts();
        }
    }

    connectNextClient();


    //for (var i = 0; i < LISTENER_COUNT; ++i) {
    //  setTimeout(
    //	function() {
    //		var client = new Client(clientOptions);
    //		var connectTimeout;
    //		//listeners.push(client);
    //
    //		client.on('sync#PushUpdateResponse', function(message) {
    //			if ((message.objectList[0].ID == putPersonRequest.theObject.ID) && (++totalUpdates % updatesReceivedDisplayCount == 0)) {
    //				log('Total PushUpdateResponses: ' + totalUpdates);
    //			}
    //		});
    //
    //		client.on('sync#PushDeleteResponse', function(message) {
    //			if ((message.objectList[0].ID == putPersonRequest.theObject.ID) && (++totalDeletes % deletesReceivedDisplayCount == 0)) {
    //				log('Total PushDeleteResponses: ' + totalDeletes);
    //			}
    //		});
    //
    //		client.on('disconnect', function() {
    //			if (!finished) {
    //				log('Client disconnected prematurely.');
    //			}
    //		});
    //
    //        var connectTimeoutHandler = function() {
    //            var existingRetryClient = retryClients[connectTimeout];
    //            if (!existingRetryClient) {
    //                // Retry at least once...
    //                connectTimeout = setTimeout(connectTimeoutHandler, connectTimeLimit);
    //                retryClients[connectTimeout] = client;
    //            }
    //            else {
    //                delete retryClients[connectTimeout];
    //                notReadyListeners++;
    //                log('Connect Failed: ' + notReadyListeners + ' / ' + readyListeners + ' | ' + LISTENER_COUNT);
    //                if (!putsSent && (readyListeners + notReadyListeners) == LISTENER_COUNT) {
    //                    log(readyListeners + ' of ' + LISTENER_COUNT + ' listeners ready.');
    //                    sendPuts();
    //                    putsSent = true;
    //                    //delete listeners[client];
    //                }
    //            }
    //        };
    //
    //		chain([
    //			function(next) {
    //				connectTimeout = setTimeout(connectTimeoutHandler, connectTimeLimit);
    //				client.connect(next);
    //			},
    //			function(next) {
    //				socketIoConnects++;
    //				if ((socketIoConnects % connectionsDisplayCount) == 0 || socketIoConnects == LISTENER_COUNT) {
    //					console.log('Socket IO Connects: ' + socketIoConnects);
    //				}
    //				client.sendSpecialMessage('connect', true);
    //				setTimeout(function () {
    //					//authRequest.deviceId = crypto.randomBytes(16).toString('hex');
    //					client.sendRequest('authenticateOAuthAccessToken', authRequest, next);
    //				}, 25);
    //			},
    //			function(next, message) {
    //				perceroConnects++;
    //				if ((perceroConnects % connectionsDisplayCount) == 0 || perceroConnects == LISTENER_COUNT) {
    //					console.log('Percero Connects: ' + perceroConnects);
    //				}
    //				client.on('sync#ConnectResponse', next);
    //			},
    //			function(next, message) {
    //				client.sendRequest('getAllByName', getPersonsRequest, next);
    //			},
    //			function() {
    //				try {
    //                    delete retryClients[connectTimeout];
    //					clearTimeout(connectTimeout);
    //				} catch(e) {}
    //
    //				if (!putsSent) {
    //					readyListeners++;
    //					listeners.push(client);
    //
    //					if ((readyListeners + notReadyListeners) == LISTENER_COUNT) {
    //						log(readyListeners + ' of ' + LISTENER_COUNT + ' listeners ready.');
    //						sendPuts();
    //						putsSent = true;
    //					}
    //				}
    //			}
    //		]);
    //	}
    //  , 1);
    //}
//    log('All ' + LISTENER_COUNT + ' listeners started.');
}

function sendPuts() {
	var client = listeners[0];
    if (!client) {
        console.log('No valid Client to send message from!');
//        exit(1);
    }

	chain([
			function(next) {
				log('Creating test object.');
				var createRequest = {};
				for (var key in putPersonRequest) {
					createRequest[key] = putPersonRequest[key];
				}
				createRequest.cn = 'com.percero.agents.sync.vo.CreateRequest';
				client.sendRequest('createObject', createRequest, next);
			},
			function(next, message) {
				if (!message.result) {
					throw new Error('Failed to create test object.');
				}

				log('Created test object.');
				var completedPuts = 0;
				for (var i = 0; i < PUT_COUNT; ++i) {
					chain([
						function(next) {
							client.sendRequest('putObject', putPersonRequest, next);
						},
						function(n, message) {
							if (!message.result) {
								throw new Error('Failed to update test object.');
							}

							if (++completedPuts == PUT_COUNT) {
								log('All ' + PUT_COUNT + ' putObject responses received.');
								next();
							}
						}
					]);
				}
				log('All putObject requests sent.');
			},
			function(next) {
				log('Removing test object.');
				var removeRequest = {
					cn: 'com.percero.agents.sync.vo.RemoveRequest',
					removePair: {
						className: putPersonRequest.theObject.cn,
						ID: putPersonRequest.theObject.ID
					}
				};
				client.sendRequest('removeObject', removeRequest, next);
			},
			function(next, message) {
				if (!message.result) {
					throw new Error('Failed to remove test object.');
				}

				log('Removed test object.');
				log('Total PushUpdateResponses: ' + totalUpdates);
				log('Total PushDeleteResponses: ' + totalDeletes);
				log('Connection Failures: ' + notReadyListeners + ' (' + (100 * (notReadyListeners / LISTENER_COUNT)) + '%)');
				log('Connection Successes: ' + readyListeners);
				finished = true;
                for(var i=0; i<listeners.length; i++) {
                    var nextConnectedClient = listeners[i];
                    console.log('Disconnecting client...');
					if (nextConnectedClient.connected) {
                        nextConnectedClient.disconnect();
                    }
				}
                client.disconnect();
				log('ALL Clients Disconnected');
                process.send({finished: true});
			}
	]);
}

function log() {
	var args = Array.prototype.slice.call(arguments, 0);
	args.unshift((process.uptime() + '').slice(0, 8));
	if (name) {
		args.unshift(name);
	}

	console.log.apply(console, args);
}

function createWorker(forceCreate) {
    if (workerCount <= workers.length) {
        if (!forceCreate) {
            // Only start another worker if forceCreate OR we have not yet reached our max number of worker threads.
            console.log('Reached max num workers, ABORTING createWorkerProcess');
            return;
        }
        else {
            console.log('Reached max num workers, FORCE createWorkerProcess');
        }
    }

    var worker = cluster.fork();
    var lastHeartbeat;
    var watchdog;
    var pid = worker.process.pid;
    var gotFirstHeartbeat = false;

    worker.on('online', function() {
        console.log('Worker online: ' + pid);
        lastHeartbeat = Date.now();
        watchdog = setInterval(function() {
            var time = Date.now();
            if (lastHeartbeat + properties['cluster.workerTimeout'] < time) {
                console.log('Worker heartbeat stopped, destroying worker: ' + pid);

                try {
                    for(var i=0; i<workers.length; i++) {
                        if (workers[i] === worker) {
                            workers.splice(i, 1);
                            break;
                        }
                    }
                    worker.disconnect();
                    worker.destroy();
                } catch(error) {
                    console.log('Error destroying worker: ' + pid);
                }
            }
        }, properties['cluster.watchdogInterval'] || 5000);
    });
    worker.on('message', function(message) {
        if (message) {
            /**
             var socketIoConnects = 0;
             var perceroConnects = 0;
             var readyListeners = 0;
             var retryClients = {};
             var clients = [];
             var notReadyListeners = 0;
             var listeners = [];
             var totalUpdates = 0;
             var totalDeletes = 0;
             var finished = false;
             var putsSent = false;
             */
            if (message.socketIoConnects) {
                socketIoConnects += message.socketIoConnects;
                if ((socketIoConnects % connectionsDisplayCount) == 0 || socketIoConnects >= (workerCount * LISTENER_COUNT)) {
                    log("SocketIOConnects: " + socketIoConnects);
                }
            }
            if (message.perceroConnects) {
                perceroConnects += message.perceroConnects;
                if ((perceroConnects % connectionsDisplayCount) == 0 || perceroConnects >= (workerCount * LISTENER_COUNT)) {
                    log("PerceroConnects: " + perceroConnects);
                }
            }
            if (message.readyListeners) {
                readyListeners += message.readyListeners;
                if (readyListeners % connectionsDisplayCount == 0) {
                    log("Ready Listeners: " + readyListeners);
                }
            }
            if (message.notReadyListeners) {
                notReadyListeners += message.notReadyListeners;
                log("Not Ready Listeners: " + notReadyListeners);
            }
            if (message.totalUpdates) {
                totalUpdates += message.totalUpdates;
                if ((totalUpdates % updatesReceivedDisplayCount) == 0) {
                    log("TotalUpdates: " + totalUpdates);
                }
            }
            if (message.totalDeletes) {
                totalUpdates += message.totalDeletes;
                if ((totalDeletes % deletesReceivedDisplayCount) == 0) {
                    log("TotalDeletes: " + totalDeletes);
                }
            }
            if (message.finished) {
                totalWorkersFinished += 1;
                log("Worker Finished " + totalWorkersFinished + " of " + workers.length);
                clearInterval(watchdog);
                worker.disconnect();
                worker.destroy();

                if (totalWorkersFinished >= workers.length) {
                    console.log('ALL Workers finished');
                    process.exit();
                }
            }
        }
    });
    worker.on('exit', function(code, signal) {
        clearInterval(watchdog);
//
//        for(var i=0; i<workers.length; i++) {
//            if (workers[i] === worker) {
//                workers.splice(i, 1);
//                break;
//            }
//        }ecl
    });

    workers.push(worker);
}
