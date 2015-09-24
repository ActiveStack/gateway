'use strict';

var Session = require('./session');
var sys = require('util');
var EventEmitter = require('events').EventEmitter;

module.exports = GatewayClient;

// Client extends EventEmitter
GatewayClient.prototype.__proto__ = EventEmitter.prototype;

/**
 * @class Manages a socket.io connection to a single client.  Shuttles requests
 * to the appropriate agent, and returns responses as they appear on the client
 * queue.
 *
 * @param socket Connection to socket.io client.
 * @param exchange Connection to agent queues.
 * @param rabbitmq Active connection to establish client response queue.
 * @param logger Winston instance.
 * @param properties Properties
 */
function GatewayClient(socket, exchange, rabbitmq, logger, properties, sessionFactory) {
    this.logger = logger.extendPrefix(socket.id);
    this.socket = socket;
    this.exchange = exchange;
    this.rabbitmq = rabbitmq;
    this.properties = properties;

    this.logger.verbose('New GatewayClient for socket.');

    this.session = sessionFactory.create();	// Client's session, which also defines client's session ID (reconnectId)

    this.awaitingResponseAcks = {};	// Holds callback functions for client message ACK's.
    this.awaitingResponseAcksInterval = {};	// Message ACK Intervals for client message re-sends.
    this.clientQueue = null;	// Client RabbitMQ Queue
    this.disposed = false;

    this.init();
}

/**
 * Cleanup this object for disposal.
 */
GatewayClient.prototype.dispose = function() {
    if(this.disposed) return;
    this.disposed = true;
    // Clear Awaiting Response Acks Intervals
    if (this.awaitingResponseAcksInterval) {
        for(var key in this.awaitingResponseAcksInterval) {
            if (this.awaitingResponseAcksInterval.hasOwnProperty(key)) {
                var theInterval = this.awaitingResponseAcksInterval[key];
                this.logger.verbose('Clearing interval: ', theInterval);
                try {
                    clearInterval(theInterval);
                } catch(error) { /* Do nothing on failure here */ }
            }
        }
        this.awaitingResponseAcksInterval = {};
    }

    // Clear Awaiting Response Acks
    this.awaitingResponseAcks = {};

    // This sockect is completely closed, need to delete queue.
    var disconnectMessage = this.session.populateMessage({
        cn: 'com.percero.agents.sync.vo.DisconnectRequest'
    });
    if (disconnectMessage.existingClientId) {
        delete disconnectMessage.existingClientId;
    }
    if (disconnectMessage.existingClientIds) {
        delete disconnectMessage.existingClientIds;
    }
    this.sendToAgent('disconnect', disconnectMessage);

    // Close down the Client Queue
    if (this.clientQueue) {
        if (this.clientQueue.state == 'open') {
            try {
                this.clientQueue.close();
            } catch (error) {
                this.logger.verbose('Unable to close clientQueue ' + this.clientQueue);
            }
        }
        this.clientQueue = undefined;
    }

    // NOTE: The socket will be closed down outside of this class.
};

GatewayClient.prototype.init = function() {
    ///////////////////////////////////
    //	Socket Handlers
    ///////////////////////////////////

    /**
     * MESSAGE
     */
    this.socket.on('message', function (message) {
        Object.keys(message).forEach(function (type) {
            this.routeSpecialMessage(type, message[type]);
        }.bind(this));
    }.bind(this));

    /**
     * SpecialMessageHandles - When the client receives a "special" message from the client, this defines how to process/handle
     *    that message.
     *    - ack            Look for the corresponding ACK and acknowledge the message. Clear and remove any interval associated with the message.
     *    - connect        Register new Auth agent and response queue (RabbitMQ Queue) for the client
     *    - hibernate        NOOP
     *    - reconnect    Attempt to initialize self using previous client settings, but with new client ID.
     */
    this.specialMessageHandlers = {
        'ack':'onAck',
        'connect':'onConnect',
        'hibernate':'onHibernate',
        'reconnect':'onReconnect'
    };

    this.socket.on('logout', this.onLogout.bind(this));
    this.socket.on('disconnect', this.onDisconnect.bind(this));
    this.socket.on('error', this.createErrorHandler('client socket'));
};

GatewayClient.prototype.onHibernate = function(){
    var hibernateMessage = this.session.populateMessage({
        cn: 'com.percero.agents.sync.vo.HibernateRequest'
    });
    this.sendToAgent('hibernate', hibernateMessage);
}

GatewayClient.prototype.onLogout = function(){
    var disconnectAuthMessage = this.session.populateMessage({
        cn: 'com.percero.agents.auth.vo.DisconnectRequest'
    });
    this.sendToAgent('disconnectAuth', disconnectAuthMessage);
    this.session.logout();
};

GatewayClient.prototype.onAck = function(message) {
    var ack = this.awaitingResponseAcks[message.correspondingMessageId];
    if (!ack) {
        // We typically get here when:
        //	We re-sent the message because the client did not ACK in time, but in the meantime the client DID ACK and thus the re-send turned out to be superfluous.
        this.logger.warn('Unexpected response ack: ', message.correspondingMessageId);
    }
    else {
        ack(message.correspondingMessageId);
        delete this.awaitingResponseAcks[message.correspondingMessageId];
    }

    var theInterval = this.awaitingResponseAcksInterval[message.correspondingMessageId];
    if (theInterval) {
        try {
            clearInterval(theInterval);
        } catch(error) {
            // If clearing the interval fails for whatever reason, we really don't care and want to move on.
        }
    }
    delete this.awaitingResponseAcksInterval[message.correspondingMessageId];
};

GatewayClient.prototype.onConnect = function() {
    if (this.clientQueue) {
        this.logger.warn('CONNECT: Client is already connected.');
        return;
    }

    this.registerEvents();
    this.registerResponseQueue();
};

GatewayClient.prototype.onDisconnect = function(message) {
    if (!this.clientQueue) {
        this.logger.warn('Client is not connected.');
    }
    this.dispose();
};

GatewayClient.prototype.onReconnect = function(message) {
    if (this.clientQueue) {
        this.logger.warn('RECONNECT: Client is already connected, disposing and then attempting reconnect');

        // Need to disengage existing clientQueue.
        this.dispose();
    }

    // The reconnectId is an encoded string that should contain all required details to re-establish the
    //	session, including the previous ClientID, which we save and then swap out for the new/current ClientID
    var newClientId = this.session.clientId;
    this.session.load(message.reconnectId);	// Decrypts the reconnectId
    if (!this.session.existingClientIds) {
        this.session.existingClientIds = [];
    }

    // Setup the existing/previous client id(s)
    var oldClientId = this.session.clientId;
    if (!oldClientId) {
        logger.error("No previous ClientID on reconnect");
    }
    else {
        this.session.existingClientId = oldClientId;
        this.session.existingClientIds.push(oldClientId);
    }
    this.session.clientId = newClientId;
    this.onConnect(message);
};

///////////////////////////////////
//	Helper Functions
///////////////////////////////////
/**
 * routeSpecialMessage - If a specialMessageHandler is defined for the message type:
 *	1. Pipe this message to that handler
 */
GatewayClient.prototype.routeSpecialMessage = function(type, message) {
    if (this.specialMessageHandlers[type]) {
        this.logger.verbose('Handling special message: ' + type + ' / ' + message);
        var handler = this.specialMessageHandlers[type];
        this[handler](message);
        this.sendSession();
    }
    else {
        this.logger.warn('Ignoring unknown message type: ' + type);
    }
};

/**
 * sendSession - Sends an updated session reconnectId String to the client. This string is used for reconnecting the client.
 * Session is only sent to the client if it is dirty (has been updated).
 */
GatewayClient.prototype.sendSession = function() {
    this.session.isDirtyAsync(function(isDirty){
        if(isDirty){
            this.logger.verbose('Sending session to client.');
            var signedSession = this.session.getSignedSession();
            this.sendToClient('gatewayConnectAck', signedSession);
        }
    }.bind(this));
};

/**
 * This method handles messages coming back from the backend intended for the client
 * @param response
 */
GatewayClient.prototype.processResponse = function(response){
    var regex = /^.*\.([^.]*)$/;
    var relativeName = response.cn.replace(regex, '$1');

    switch(relativeName){
        case 'UserToken':
            this.logUserInWithUserToken(response);
            break;
        case 'AuthenticateUserAccountResponse':
            this.logUserInWithAuthResponse(response);
            break;
        case 'AuthenticateOAuthCodeResponse':
            this.logUserInWithAuthResponse(response);
            break;
        case 'AuthenticateOAuthAccessTokenResponse':
            this.logUserInWithAuthResponse(response);
            break;
        case 'AuthenticationResponse':
            this.logUserInWithAuthResponse(response);
            break;
        case 'ConnectResponse':
            this.logger.verbose('Handling ConnectResponse for client ' + response.clientId);
            if (!response.clientId) {
                this.logger.error('Invalid ClientID for ConnectResponse (existing client ID '
                    + this.session.existingClientId + ')');
                // ConnectResponse is indicating this client is INVALID.
                this.session.logout();
            }
            break;
        case 'ReconnectResponse':
            this.logger.verbose('Handling ReconnectResponse for client ' + response.clientId);

            if (!response.clientId) {
                this.logger.error('Invalid ClientID for ReconnectResponse (existing client ID '
                    + this.session.existingClientId + ')');
                this.session.logout();
            }
            // No longer need the existingClientId;
            this.session.existingClientId = undefined;
            break;

    }
};

/**
 * Sets up the client's session for credentials from the UserToken response
 * @param response
 */
GatewayClient.prototype.logUserInWithUserToken = function(response) {

    if (response.user) {
        if (response.user.hasOwnProperty("ID"))
            this.session.userId = response.user.ID;
        else if (response.user.hasOwnProperty("id"))
            this.session.userId = response.user.id;
        else
            this.logger.error("Invalid User in response.");

        this.session.token = response.token;
        this.session.deviceId = response.deviceId;
    }

    this.logger.debug('Received AuthResponse: ' + response.cn);

    this.afterLogin();

}

/**
 * Sets up the client's session for the credenbtials from the Authenticate**Response
 * @param response
 */
GatewayClient.prototype.logUserInWithAuthResponse = function(response) {
    // Validate format a bit
    if (response.result && response.result.user) {
        if (response.result.user.hasOwnProperty("ID"))
            this.session.userId = response.result.user.ID;
        else if (response.result.user.hasOwnProperty("id"))
            this.session.userId = response.result.user.id;
        else
            this.logger.error("Invalid User in response.result");

        this.session.token = response.result.token;
        this.session.deviceId = response.result.deviceId;
    }
    this.logger.debug('Received AuthResponse: ' + response.cn);

    this.afterLogin();
}

/**
 * Method to be called after user is logged in by either logUserInWithUserToken or
 * logUserInWithAuthResponse.
 */
GatewayClient.prototype.afterLogin = function(){
    if(this.session.isLoggedIn()){
        // If the session has an existingClientId that is DIFFERENT from its clientId, then issue a ReconnectMessage instead.
        if (this.session.existingClientId && this.session.existingClientId !== this.session.clientId) {
            var reconnectMessage = this.session.populateMessage({
                cn: 'com.percero.agents.sync.vo.ReconnectRequest',
                existingClientId: this.session.existingClientId,
                existingClientIds: this.session.existingClientIds
            });
            this.logger.verbose('Reconnect Message for session client ' + this.session.clientId
                + ': ' + JSON.stringify(reconnectMessage));
            this.sendToAgent('reconnect', reconnectMessage);
        }
        else {
            var connectMessage = this.session.populateMessage({
                cn: 'com.percero.agents.sync.vo.ConnectRequest'
            });
            this.logger.verbose('Connect Message for session client ' + this.session.clientId
                + ': ' + JSON.stringify(connectMessage));
            this.sendToAgent('connect', connectMessage);
        }
    }
};

/**
 * Callback for messages that arrive on the client queue
 * @param response
 * @param headers
 * @param info
 * @param receipt
 */
GatewayClient.prototype.onClientQueueMessage = function(response, headers, info, receipt) {
    if (!response) {
        this.logger.error("NULL response in client.onClientQueueMessage:");
        this.logger.error("headers: ");
        this.logger.error(sys.inspect(headers));
        this.logger.error("info: ");
        this.logger.error(sys.inspect(info));
        this.logger.error("receipt: ");
        this.logger.error(sys.inspect(receipt));
        return;
    }

    if (response.EOL) {
        // This is an End-Of-Life message for this queue.
        // If the response clientId does NOT match the current session clientId, then this client has
        //	already moved on and nothing needs to happen here. This typically happens when a client
        //	reconnects from the same network/IP address/router.
        if (response.clientId && response.clientId !== this.session.clientId) {
            this.logger.verbose('Ignoring EOL message for ' + response.clientId + ' -> ' + this.session.clientId);
            return;
        }
        else {
            // This client is no longer valid. This typically happens when a client reconnects
            //	from a different network/IP address/router.
            this.logger.verbose('Received EOL for queue ' + this.session.clientId);
            this.isServerTerminated = true;
            this.dispose();
            this.emit('dispose', true);
            return;
        }
    }

    this.logger.verbose('Sending response: ' + response.cn);

    if (!this.clientQueue) {
        this.logger.warn('Bailing on response; queue is already closed.');
        return;
    }

    this.processResponse(response);
    this.sendSession();	// Send the updated session to the client.

    if (response.correspondingMessageId) {
        this.setupResendInterval(response, receipt);
    } else {
        receipt.acknowledge();
    }

    this.sendToClient('push', response);
};

/**
 * Setup an interval to resend the message, at some interval until the client acks
 * @param theResponse
 * @param receipt
 */
GatewayClient.prototype.setupResendInterval = function(theResponse, receipt) {
    // Setup callback function to be used when the 'onAck' function is called for this message
    this.awaitingResponseAcks[theResponse.correspondingMessageId] = function() {
        receipt.acknowledge();
    };

    this.awaitingResponseAcksInterval[theResponse.correspondingMessageId] =
        setInterval(this.resend.bind(this, theResponse),
            (this.properties['frontend.clientMessageResendInterval'] || 7500));
};

/**
 * Callback function to the interval setup in setupResendInterval. Tries to resend the
 * message.
 *
 * @param theResponse
 */
GatewayClient.prototype.resend = function(theResponse) {
    var ack = this.awaitingResponseAcks[theResponse.correspondingMessageId];
    if (ack) {
        this.logger.warn('Unacknowledged message being sent again: ', theResponse.correspondingMessageId);
        this.sendToClient('push', theResponse);
    }
    else {
        var theInterval = this.awaitingResponseAcksInterval[theResponse.correspondingMessageId];
        if (theInterval) {
            this.logger.verbose('Message acknowledged, clearing timer.');
            clearInterval(theInterval);
        }
        delete this.awaitingResponseAcksInterval[theResponse.correspondingMessageId];
    }
}

/**
 * Callback function for client queue creation
 * @param queue
 */
GatewayClient.prototype.onClientQueueCreation = function(queue) {
    var options = { ack: true, prefetchCount: 10 };

    // Setup subscription to the new queue.
    queue.subscribe(options, this.onClientQueueMessage.bind(this));

    queue.on('close', this.onClientQueueClose.bind(this));
    queue.on('delete', this.onClientQueueDeleted.bind(this));
    queue.on('error', this.createErrorHandler('client queue'));
};

/**
 * Callback function for when client queue is closed
 */
GatewayClient.prototype.onClientQueueClose = function(){
    // This client is no longer valid because the RabbitQueue has closed.
    this.logger.verbose('Rabbit Queue Closed: ' + this.session.clientId);
    this.dispose();
    this.emit('dispose');
};

/**
 * Callback function for when the client queue is deleted
 */
GatewayClient.prototype.onClientQueueDeleted = function(){
    // This client is no longer valid because the RabbitQueue has been deleted.
    this.logger.verbose('Rabbit Queue Deleted: ' + this.session.clientId);
    this.dispose();
    this.emit('dispose');
};

/**
 * registerResponseQueue - Sets up a new RabbitMQ Queue for this client, using the session.clientId as the
 *	name for the queue. Once the queue is setup, subscribes to the queue. This queue is for messages from the
 *	ActiveStack back-end that are intended for the client.
 */
GatewayClient.prototype.registerResponseQueue = function() {
    this.logger.verbose('Setting up rabbit queue ' + this.session.clientId);
    this.clientQueue = this.rabbitmq.queue(this.session.clientId, this.exchange.options,
        this.onClientQueueCreation.bind(this));
};

GatewayClient.UNAUTH_EVENTS = [
    'authenticateOAuthAccessToken',
    'authenticateOAuthCode',
    'authenticateUserAccount',
    'authenticate',
    'reauthenticate',
    'getAllServiceProviders',
    'getOAuthRequestToken',
    'getRegAppOAuths',
    'getRegisteredApplication',
    'getServiceUsers',
    'logoutUser',
    'testCall',
    'validateUserByToken'
];

GatewayClient.AUTH_EVENTS = [
    'createObject',
    'create',
    'delete',
    'deletesReceived',
    'logout',
    'findByExample',
    'findById',
    'findByIds',
    'findUnique',
    'getHistory',
    'countAllByName',
    'getAllByName',
    'processTransaction',
    'putObject',
    'removeObject',
    'runProcess',
    'runQuery',
    'searchByExample',
    'update',
    'updatesReceived',
    'upgradeClient',
    'getChangeWatcher'
];

/**
 * registerEvents - Add agent to list of agents, setting up listeners for each event type the agent handles.
 *	Unregister the agent first in case it is already registered.
 */
GatewayClient.prototype.registerEvents = function() {
    GatewayClient.UNAUTH_EVENTS.forEach(function(eventName) {
        this.socket.on(eventName, this.onSocketEvent.bind(this, eventName));
    }.bind(this));

    GatewayClient.AUTH_EVENTS.forEach(function(eventName) {
        this.socket.on(eventName, this.onAuthSocketEvent.bind(this, eventName));
    }.bind(this));
};

GatewayClient.prototype.onSocketEvent = function(eventName, request){
    if (request !== undefined) {
        this.logger.verbose('Got request (' + eventName + ')');
        this.logger.verbose('Request details: ', request);

        if (this.sendToAgent(eventName, request) ) {
            if (request.sendAck) {
                this.logger.verbose('Request has sendAck, sending "ack" to client');
                this.sendToClient('ack', request.messageId);
            }
        }
        else {
            this.logger.error('Error sending message to agent: ' + error);
        }
    }
    else {
        this.logger.error("Received undefined request");
    }
};

GatewayClient.prototype.onAuthSocketEvent = function(eventName, request){
    if(this.session.isLoggedIn()){
        this.onSocketEvent(eventName, request)
    }
    else{
        this.logger.warn("Got auth event for unauthenticated session: "+eventName);
    }
};

/**
 * sendToAgent - Send the message to the specified agent via RabbitMQ client queue.  If the message.clientId
 *	is different than the session.clientId, update the message.clientId to match the session.clientId. This is
 *	an enabler for legacy clients that are unable to update their clientId upon reconnect.
 */
GatewayClient.prototype.sendToAgent = function(name, message, callback) {
    this.logger.verbose( 'Sending to agent (' + name + '): ', JSON.stringify(message) );
    if (!this.exchange || this.exchange.state === 'closed') {
        // The RabbitMQ Exchange is dead, we can no longer function...
        this.logger.error('No Rabbit Exchange or exchange closed!!!');
        this.dispose();
        this.emit('dispose');
        return false;
    }
    else {
        if (message.clientId && message.clientId !== this.session.clientId) {
            // The message's clientId does not match the session's clientId.  This typically happens after a device has reconnected
            //	and the client library does not update to it's new clientId.
            this.logger.verbose('Message client ' + message.clientId + ' is different than Session client ' + this.session.clientId);
            message.clientId = this.session.clientId;
        }

        // Publish the message to the queue.
        this.exchange.publish(name, message, {
            replyTo: this.session.clientId,
            mandatory: true,
            confirm: true
        }, callback);
        return true;
    }
};

/**
 * sendToClient - Send the message to the client via the socket connection.
 */
GatewayClient.prototype.sendToClient = function(name, message) {
    this.logger.verbose('Sending to client (' + name + '): ', message);
    this.socket.emit(name, message);
};

GatewayClient.prototype.createErrorHandler = function(source) {
    return function(error) {
        this.logger.error('Fatal ' + source + ' error: ', error.stack);

        this.socket.disconnect();
        try {
            this.clientQueue.close();
            this.clientQueue = undefined;
        } catch(error) {
            this.logger.error('Error disconnecting client queue: ', error);
        }
    }.bind(this);
};
