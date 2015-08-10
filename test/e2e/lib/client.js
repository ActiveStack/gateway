'use strict';

var connect = require('connect');
var io = require('socket.io-client');
var crypto = require('crypto');
var util = require('util');

var winston = require('winston');
var logger = new winston.Logger({
	transports: [ new winston.transports.Console({ level: 'info' }) ],
	levels: { silly: 0, debug: 1, verbose: 2, info: 3, warn: 4, error: 5 }
});

module.exports = Client;

function Client(config) {
	var self = this;
	var socket;
	var connected = false;
	var session = {};
	var responseCallbacks = {};

	this.connect = function(callback) {
		if (socket) {
			console.log('ALREADY CONNECTED');
		}

		socket = io.connect('http://' + config.host + ':' + config.port, {
			'force new connection': true,
			'reconnect': false,
			'try multiple transports': false
		});

		socket.on('connect', function() {
			self.connected = true;
			callback();
		});

		socket.on('push', function(message) {
			var parts = message.cn.match(/^com\.percero\.agents\.([^.]+)\.vo\.(.+)$/);
			var agent = parts[1];
			var type = parts[2];
			var eventName = agent + '#' + type;

			var responseCallback = responseCallbacks[message.correspondingMessageId];
			if (responseCallback) {
				responseCallback(message, optionsCallback);
				delete responseCallbacks[message.correspondingMessageId];
			} else if (!self.listeners(eventName).length) {
				// XXX: No one listening
				console.log('MESSAGE: ', message);
			}

			var autoAck = true;
			self.emit(eventName, message, optionsCallback);

			if (autoAck && message.correspondingMessageId) {
				var ackMessage = {
					correspondingMessageId: message.correspondingMessageId
				};
				self.sendSpecialMessage('ack', ackMessage);
			}

			function optionsCallback(options) {
				if (options.autoAck !== undefined) {
					autoAck = options.autoAck;
				}
			}
		});

		socket.on('disconnect', function(reason) {
			self.connected = false;
            self.emit('disconnect', reason);
            //self.emit('logout', reason);
		});

		socket.on('gatewayConnectAck', function(message) {
			// TODO: Why can't the gateway manage the session?
			var updates = message.split(';')[0];
			updates = JSON.parse(new Buffer(updates, 'base64').toString());
			delete updates.savedAt;
			self.updateSession(updates);
		});
	};

	this.disconnect = function(clearLocalData) {
		if (socket) {
//			socket.emit('logout');

            if (clearLocalData === undefined) {
                clearLocalData = false;
            }
            var logoutRequest = {
                cn: 'com.percero.agents.sync.vo.LogoutRequest',
                pleaseDestroyClient: clearLocalData
            };
            this.sendRequest('logout', logoutRequest);
			setTimeout(function() {
				socket.disconnect();
			});
		}
	};

	this.updateSession = function(updates) {
		for (var key in updates) {
			session[key] = updates[key];

			if (updates[key] === undefined) {
				delete session[key];
			}
		}
	};

	this.sendRequest = function(type, request, responseCallback) {
		if (!socket) {
			// XXX: Fail
		}

		var payload = { messageId: crypto.randomBytes(16).toString('hex') };
		for (var key in session) {
			payload[key] = session[key];
		}
		for (key in request) {
			payload[key] = request[key];
		}

		if (responseCallback) {
			responseCallbacks[payload.messageId] = responseCallback;
		}

		socket.emit(type, payload);

		return payload;
	};

	this.sendSpecialMessage = function(type, message) {
		var payload = {};
		payload[type] = message;

		socket.emit('message', payload);
	};
}

util.inherits(Client, process.EventEmitter);

/*
var theAccessToken = 'ya29.AHES6ZRueenOKSxT_Q8puyND1DRAr8taStoXalzMDCU01PatdNUn_a0';
var theRefreshToken = '1/G3ZFYptJEsBgAci8qAGPmYwEnElUEavENIQpa9NOLPI';

options = {host: 'qanode.psiglobaldb.com', port: 8080, regAppKey: 'PSI_29V97G', svcOauthKey: '718060161923.apps.googleusercontent.com', accessToken: theAccessToken, refreshToken: theRefreshToken, redirectUri: 'urn:ietf:wg:oauth:2.0:oob'}

function startTest(command, worker) {
	// Send Connect to Queue request.
	var connectRequest = {connect: 'connect'};
	socket.emit('message', connectRequest);

	var accessToken = command.accessToken;
	var refreshToken = command.refreshToken;
	var regAppKey = command.regAppKey;
	var svcOauthKey = command.svcOauthKey;
	var redirectUri = command.redirectUri;

	if (accessToken && refreshToken) {
		console.log('Attempting authentication...');
		var authReq = setupAuthenticateOAuthAccessTokenRequest(regAppKey, svcOauthKey, accessToken, refreshToken, redirectUri);
		socket.emit('authenticateOAuthAccessToken', authReq);
	}
};

function setupAuthRequest() {
	var authRequest = {};
	authRequest.cn = 'com.percero.agents.auth.vo.AuthRequest';
	authRequest.userId = '';
	authRequest.token = token;
	authRequest.clientType = 'N';
	authRequest.clientId = '';
	authRequest.messageId = guidGenerator();
	return authRequest;
}

function setupAuthenticateOAuthAccessTokenRequest(regAppKey, svcOauthKey, accessToken, refreshToken, redirectUri) {
	var authAccessTokenRequest = setupAuthRequest();
	authAccessTokenRequest.cn = 'com.percero.agents.auth.vo.AuthenticateOAuthAccessTokenRequest';
	authAccessTokenRequest.regAppKey = regAppKey;
	authAccessTokenRequest.svcOauthKey = svcOauthKey;
	authAccessTokenRequest.accessToken = accessToken;
	authAccessTokenRequest.refreshToken = refreshToken;
	authAccessTokenRequest.redirectUri = redirectUri;
	return authAccessTokenRequest;
}

function setupSyncRequest() {
	var request = {};
	request.cn = 'com.percero.agents.sync.vo.SyncRequest';
	request.userId = userId;
	request.token = token;
	request.clientType = '';
	request.clientId =  clientId;
	request.messageId = guidGenerator();
	return request;
}

function setupGetAllByNameRequest(theClassName) {
	var request = setupSyncRequest();
	request.cn = 'com.percero.agents.sync.vo.GetAllByNameRequest';
	request.theClassName = theClassName;
	return request;
}

function setupPutRequest(theObject) {
	var request = setupSyncRequest();
	request.cn = 'com.percero.agents.sync.vo.PutRequest';
	request.transId = guidGenerator();
	request.putTimestamp = Date.now();
	request.theObject = theObject;
	return request;
}

*/
