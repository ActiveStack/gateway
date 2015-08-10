var ClientFactory = require('../../factory/client_factory'),
    GatewayClient = require('../../../src/service/client'),
    SessionFactory = require('../../factory/session_factory'),
    expect = require('chai').expect,
    sinon = require('sinon');

describe('Client', function(){
    var client;
    beforeEach(function(){ client = ClientFactory.create(); })

    describe('#dispose', function(){
        it('will clear awaitingResponseAcksIntervals', function(){
            var origClearInterval = clearInterval;

            client.awaitingResponseAcksInterval = {
                a: 'a',
                b: 'b'
            }

            // Mock clearInterval
            clearInterval = sinon.spy();

            client.dispose();
            expect(clearInterval.callCount).to.equal(2);
            expect(client.awaitingResponseAcksInterval).to.be.empty;
            clearInterval = origClearInterval;
        });

        it('will shut down the client queue if it exists and state is open', function(){
            client.clientQueue = { state: 'open' };
            var spy = client.clientQueue.close = sinon.spy();

            client.dispose();
            expect(spy.called).to.be.true;
            expect(client.clientQueue).to.be.undefined;
        });

        it('will not shutdown the client queue if not open', function(){
            client.clientQueue = { state: 'closed' };
            var spy = client.clientQueue.close = sinon.spy();

            client.dispose();
            expect(spy.called).to.be.false;
            expect(client.clientQueue).to.be.undefined;
        });

        it('will send disconnect message to backend if not being shut down', function(){
            sinon.spy(client,'sendToAgent');
            client.dispose();
            expect(client.sendToAgent.called).to.be.true;
        });
    });

    describe('#init', function(){
        it('sets up the socket event listeners', function(){
            sinon.spy(client.socket,'on');

            client.init();

            expect(client.socket.on.calledWith('message')).to.be.true;
            expect(client.socket.on.calledWith('logout')).to.be.true;
            expect(client.socket.on.calledWith('disconnect')).to.be.true;
            expect(client.socket.on.calledWith('error')).to.be.true;
            expect(Object.keys(client.specialMessageHandlers)).to.eql(
                ['ack','connect','hibernate','reconnect']);
        });
    });

    describe('#onHibernate', function(){
        it('sends a HibernateRequest to the backend', function(){
            sinon.spy(client,'sendToAgent');
            client.onHibernate();
            expect(client.sendToAgent.calledWith('hibernate')).to.be.true;
        });
    });

    describe('#onLogout', function(){
        it('sends a DisconnectRequest to the backend', function(){
            sinon.spy(client,'sendToAgent');
            client.onLogout();
            expect(client.sendToAgent.calledWith('disconnectAuth')).to.be.true;
        });

        it('logouts out the session', function(){
            sinon.spy(client.session,'logout');
            client.onLogout();
            expect(client.session.logout.called).to.be.true;
        });
    });

    describe('#onAck', function(){
        it('will call the ack callback and clear the interval', function(){
            var origClearInterval = clearInterval;
            clearInterval = sinon.spy();

            var messageId = 'aaa';
            var spy = client.awaitingResponseAcks[messageId] = sinon.spy();
            var interval = client.awaitingResponseAcksInterval[messageId] = setInterval(function(){},1000000);
            client.onAck({correspondingMessageId: messageId});

            expect(spy.calledWith(messageId)).to.be.true;
            expect(clearInterval.calledWith(interval)).to.be.true;
            expect(client.awaitingResponseAcks[messageId]).to.be.undefined;
            expect(client.awaitingResponseAcksInterval[messageId]).to.be.undefined;

            // Reset the clearInterval function
            clearInterval = origClearInterval;
        });
    });

    describe('#onConnect', function(){
        it('will register events if no client queue', function(){
            sinon.spy(client,'registerEvents');
            client.onConnect();
            expect(client.registerEvents.called).to.be.true;
        });

        it('will register the reponse queue', function(){
            sinon.spy(client,'registerResponseQueue');
            client.onConnect();
            expect(client.registerResponseQueue.called).to.be.true;
        });

        it('will do nothing if client queue already exists', function(){
            client.clientQueue = {};
            sinon.spy(client,'registerResponseQueue');
            sinon.spy(client,'registerEvents');

            client.onConnect();

            expect(client.registerEvents.called).to.be.false;
            expect(client.registerResponseQueue.called).to.be.false;
        });
    });

    describe('#onDisconnect', function(){
        it('will dispose of the client', function(){
            sinon.spy(client,'dispose');
            client.onDisconnect();
            expect(client.dispose.called).to.be.true;
        });
    });

    describe('#onReconnect', function(){
        var session;
        beforeEach(function(){ session = SessionFactory.create() });

        it('will call dispose if have an existing clientQueue', function(){
            client.clientQueue = {};
            sinon.spy(client,'dispose');
            client.onReconnect({reconnectId: session.getSignedSession()})
            expect(client.dispose.called).to.be.true;
        });

        it('will load the reconnect session and overwrite the current one', function(){
            client.onReconnect({reconnectId: session.getSignedSession()});
            expect(client.session.userId).to.equal(session.userId);
        });

        it('will retain the new clientId', function(){
            var newClientId = client.session.clientId;
            client.onReconnect({reconnectId: session.getSignedSession()});
            expect(client.session.clientId).to.equal(newClientId);
        });

        it('will set the existingClientId to the old clientId and add it to existingClientIds', function(){
            var oldClientId = session.clientId;
            client.onReconnect({reconnectId: session.getSignedSession()});
            expect(client.session.existingClientId).to.equal(oldClientId);
            expect(client.session.existingClientIds).to.eql([oldClientId]);
        });
    });

    describe('#routeSpecialMessage', function(){
        beforeEach(function(){ sinon.spy(client, 'sendSession') });

        it('will route supported special messages', function(){
            for(var type in client.specialMessageHandlers){
                var handlerName = client.specialMessageHandlers[type]
                sinon.spy(client, handlerName);
                client.routeSpecialMessage(type, {});
                expect(client[handlerName].called).to.be.true;
                expect(client.sendSession.called).to.be.true;
                client.sendSession.reset(); // Reset the spy
            }
        });

        it('will not do anything for an unsupported special message', function(){
            client.routeSpecialMessage('sheep',{});
            expect(client.sendSession.called).to.be.false;
        });
    });

    describe('#sendSession', function(){
        beforeEach(function(){
            sinon.spy(client, 'sendToClient');
        });
        it('will send the session to the client if dirty', function(done){
            client.sendSession();
            process.nextTick(function(){
                expect(client.session._dirty).to.be.false;
                expect(client.sendToClient.called).to.be.true;
                done();
            });
        });
    });

    describe('#processResponse', function(){
        it('will call logUserInWithAuthResponse for several response types', function(){
            var types = [
                'AuthenticateUserAccountResponse',
                'AuthenticateOAuthCodeResponse',
                'AuthenticateOAuthAccessTokenResponse'
            ];
            sinon.spy(client,'logUserInWithAuthResponse');
            types.forEach(function(type){
                var response = {
                    cn: 'io.activestack.auth.'+type
                };
                client.processResponse(response);
                expect(client.logUserInWithAuthResponse.called).to.be.true;
                client.logUserInWithAuthResponse.reset // reset the spy
            });

        });

        it('will call logUserInWithUserToken for UserToken message', function(){
            var response = {
                cn: 'io.activestack.sync.UserToken',
                clientId: null
            };
            sinon.spy(client, 'logUserInWithUserToken');
            client.processResponse(response);
            expect(client.logUserInWithUserToken.called).to.be.true;
        });

        it('will logout the session if missing clientId on the connect response', function(){
            var response = {
                cn: 'io.activestack.sync.ConnectResponse',
                clientId: null
            };
            sinon.spy(client.session, 'logout');
            client.processResponse(response);
            expect(client.session.logout.called).to.be.true;
        });

        it('will not logout the session if has clientId on connect response', function(){
            var response = {
                cn: 'io.activestack.sync.ConnectResponse',
                clientId: '12345'
            };
            sinon.spy(client.session, 'logout');
            client.processResponse(response);
            expect(client.session.logout.called).to.be.false;
        });

        it('will set session.existingClientId to undefined for ReconnectResponse', function(){
            var response = {
                cn: 'io.activestack.sync.ReconnectResponse',
                clientId: '12345'
            }
            client.processResponse(response);
            expect(client.session.existingClientId).to.be.undefined;
        });

        it('will logout the session if clientId missing for ReconectResponse', function(){
            var response = {
                cn: 'io.activestack.sync.ReconnectResponse',
                clientId: null
            }
            sinon.spy(client.session,'logout');
            client.processResponse(response);
            expect(client.session.logout.called).to.be.true;
        });
    });

    describe('#logUserInWithUserToken', function(){
        it('will set the userId, token and deviceId on the session', function(){
            var response = {
                user: {ID: '12345'},
                token: 'moo',
                deviceId: '56789'
            };
            sinon.spy(client,'afterLogin');
            client.logUserInWithUserToken(response);
            expect(client.session.userId).to.equal('12345');
            expect(client.session.token).to.equal('moo');
            expect(client.session.deviceId).to.equal('56789');
            expect(client.afterLogin.called).to.be.true;
        });
    });

    describe('#logUserInWithAuthResponse', function(){
        it('will set the userId, token and deviceId on the session', function(){
            var response = {
                result: {
                    user: {ID: '12345'},
                    token: 'moo',
                    deviceId: '56789'
                }
            };
            sinon.spy(client,'afterLogin');
            client.logUserInWithAuthResponse(response);
            expect(client.session.userId).to.equal('12345');
            expect(client.session.token).to.equal('moo');
            expect(client.session.deviceId).to.equal('56789');
            expect(client.afterLogin.called).to.be.true;
        });
    });

    describe('#afterLogin', function(){
        beforeEach(function(){ sinon.spy(client,'sendToAgent') });
        it('will send a reconnect message if existingClientId != clientId', function(){
            client.afterLogin();
            expect(client.sendToAgent.calledWith('reconnect')).to.be.true;
        });

        it('will send a connect message if existingClientId empty or the same as clientId', function(){
            client.session.userId = 'moo';
            client.session.existingClientId = null;
            client.afterLogin();
            expect(client.sendToAgent.calledWith('connect')).to.be.true;
        });
    });

    describe('#onClientQueueMessage', function(){
        beforeEach(function(){
            sinon.spy(client,'sendToClient');
            sinon.spy(client,'dispose');
            sinon.spy(client,'emit');
            sinon.spy(client,'processResponse');
            sinon.spy(client,'sendSession');
            sinon.spy(client,'setupResendInterval');
        });

        it('will return when response is null', function(){
            client.onClientQueueMessage(null, {},{},{});
            expect(client.sendToClient.called).to.be.false;
        });

        it('will ignore EOL messages when the response.clientId != session.clientId', function(){
            client.session.clientId = 'b';
            var response = {
                EOL: true,
                clientId: 'a',
            };

            client.onClientQueueMessage(response, {}, {}, {});

            expect(client.sendToClient.called).to.be.false;
            expect(client.dispose.called).to.be.false;
            expect(client.emit.called).to.be.false;
        });

        it('will dispose of client when EOL message received and return', function(){
            var response = {
                EOL: true,
                clientId: client.session.clientId,
            };

            client.onClientQueueMessage(response, {}, {}, {});

            expect(client.sendToClient.called).to.be.false;
            expect(client.dispose.called).to.be.true;
            expect(client.emit.called).to.be.true;
        });

        it('will not process message when when clientQueue null', function(){
            client.clientQueue = null;
            client.onClientQueueMessage({},{},{},{});
            expect(client.processResponse.called).to.be.false;
            expect(client.sendSession.called).to.be.false;
            expect(client.sendToClient.called).to.be.false;
        });

        it('will process the message and acknowledge the message', function(){
            client.clientQueue = {};
            var message = {
                cn: 'io.activestack.sync.SomeMessage'
            };
            var receipt = {
                acknowledge: sinon.spy()
            };

            client.onClientQueueMessage(message,{},{}, receipt);

            expect(client.processResponse.called).to.be.true;
            expect(client.sendSession.called).to.be.true;
            expect(client.sendToClient.called).to.be.true;
            expect(receipt.acknowledge.called).to.be.true;
            expect(client.setupResendInterval.called).to.be.false;
        });

        it('will process the message and setup a resend interval', function(){
            client.clientQueue = {};
            var message = {
                cn: 'io.activestack.sync.SomeMessage',
                correspondingMessageId: 'a'
            };
            var receipt = {
                acknowledge: sinon.spy()
            };

            client.onClientQueueMessage(message,{},{}, receipt);

            expect(client.processResponse.called).to.be.true;
            expect(client.sendSession.called).to.be.true;
            expect(client.sendToClient.called).to.be.true;
            expect(receipt.acknowledge.called).to.be.false;
            expect(client.setupResendInterval.called).to.be.true;
        });
    });

    describe('#setupResendInterval', function(){
        it('will create the ack callback and start the interval', function(){
            var origSetInterval = setInterval;
            setInterval = sinon.spy();

            var messageId = 'a';
            var message = {
                correspondingMessageId: messageId
            };

            client.setupResendInterval(message, null);

            expect(client.awaitingResponseAcks).to.have.property(messageId);
            expect(client.awaitingResponseAcksInterval).to.have.property(messageId);
            expect(setInterval.called).to.be.true;

            setInterval = origSetInterval;
        });
    });

    describe('#resend', function(){
        beforeEach(function(){
            sinon.spy(client,'sendToClient');
        });
        it('will resend the message to the client if it has an ack for it', function(){
            var messageId = 'a';
            var message = {
                correspondingMessageId: messageId
            };
            client.awaitingResponseAcks[messageId] = {};
            client.resend(message);

            expect(client.sendToClient.called).to.be.true;
        });

        it('will not send and clear the interval if no ack found', function(){
            var origClearInterval = clearInterval;

            clearInterval = sinon.spy();
            var messageId = 'a';
            var message = {
                correspondingMessageId: messageId
            };
            client.awaitingResponseAcksInterval[messageId] = {};

            client.resend(message);

            expect(client.sendToClient.called).to.be.false;
            expect(clearInterval.called).to.be.true;
            expect(client.awaitingResponseAcksInterval).to.not.have.property(messageId);

            clearInterval = origClearInterval;
        });
    });

    describe('#onClientQueueCreation', function(){
        it('subscribes and registers event listeners on the queue', function(){
            var queue = {
                subscribe: sinon.spy(),
                on: sinon.spy()
            };

            client.onClientQueueCreation(queue);

            expect(queue.subscribe.called).to.be.true;
            expect(queue.on.calledWith('close')).to.be.true;
            expect(queue.on.calledWith('delete')).to.be.true;
            expect(queue.on.calledWith('error')).to.be.true;
        })
    });

    describe('#onClientQueueClose', function(){
        it('will dispose of the client', function(){
            sinon.spy(client,'dispose');
            sinon.spy(client,'emit');
            client.onClientQueueClose();
            expect(client.dispose.called).to.be.true;
            expect(client.emit.called).to.be.true;
        });
    });

    describe('#onClientQueueDeleted', function(){
        it('will dispose of the client', function(){
            sinon.spy(client,'dispose');
            sinon.spy(client,'emit');
            client.onClientQueueDeleted();
            expect(client.dispose.called).to.be.true;
            expect(client.emit.called).to.be.true;
        });
    });

    describe('#registerResponseQueue', function(){
        it('will create a new client queue on rabbit', function(){
            sinon.spy(client.rabbitmq,'queue');
            client.registerResponseQueue();
            expect(client.rabbitmq.queue.called).to.be.true;
        });
    });

    describe('#registerEvents', function(){
        it('will register a listener for business events', function(){
            sinon.spy(client.socket,'on');
            client.registerEvents();
            expect(client.socket.on.callCount)
                .to.equal(
                GatewayClient.AUTH_EVENTS.length + GatewayClient.UNAUTH_EVENTS.length)
        });
    });

    describe('#onSocketEvent', function(){
        beforeEach(function(){
            sinon.spy(client,'sendToAgent');
            sinon.spy(client,'sendToClient');
        });
        it('will send message to the backend and not ack', function(){
            client.onSocketEvent('boo', {});
            expect(client.sendToAgent.called).to.be.true;
            expect(client.sendToClient.called).to.be.false;
        });

        it('will send message to the backend and not ack', function(){
            client.onSocketEvent('boo', {sendAck: true});
            expect(client.sendToAgent.called).to.be.true;
            expect(client.sendToClient.called).to.be.true;
        });
    });

    describe('#onAuthSocketEvent', function(){
        beforeEach(function(){
            sinon.spy(client,'onSocketEvent');
        });
        it('will process the message if logged in', function(){
            client.session.userId = 'a';
            client.onAuthSocketEvent('boo', {});
            expect(client.onSocketEvent.called).to.be.true;
        });
        it('will ignore the message if not logged in', function(){
            client.session.userId = null;
            client.onAuthSocketEvent('boo',{});
            expect(client.onSocketEvent.called).to.be.false;
        });
    });

    describe('#sendToAgent', function(){
        beforeEach(function(){
            sinon.spy(client,'dispose');
            sinon.spy(client,'emit');
            sinon.spy(client.exchange,'publish');
        });

        it('will not send to agent if exchange null', function(){
            client.exchange = null;
            expect(client.sendToAgent('boo',{})).to.be.false;
            expect(client.dispose.called).to.be.true;
            expect(client.emit.called).to.be.true;
        });

        it('will not send to agent if exchange closed', function(){
            client.exchange.state = 'closed';
            expect(client.sendToAgent('boo',{})).to.be.false;
            expect(client.dispose.called).to.be.true;
            expect(client.emit.called).to.be.true;
        });

        it('will overwrite the message clientId if different than session', function(){
            var clientId = 'arg';
            var message = {clientId:clientId};
            client.session.clientId = 'cow';
            expect(client.sendToAgent('boo', message)).to.be.true;
            expect(message.clientId).to.equal('cow');
        });

        it('will publish the message to the message to the exchange', function(){
            expect(client.sendToAgent('boo', {})).to.be.true;
            expect(client.exchange.publish.calledWith('boo'));
        });
    });

    describe('#sendToClient', function(){
        it('will emit an event on the socket', function(){
            sinon.spy(client.socket,'emit');
            client.sendToClient('moo',{});
            expect(client.socket.emit.calledWith('moo'));
        });
    });

    describe('#createErrorHandler', function(){
        it('will return a function', function(){
            expect(client.createErrorHandler()).to.be.a('Function');
        });
    });
});