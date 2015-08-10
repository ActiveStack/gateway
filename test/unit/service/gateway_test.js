var Gateway         = require('../../../src/service/gateway'),
    GatewayClient   = require('../../../src/service/client'),
    GatewayFactory  = require('../../factory/gateway_factory'),
    ClientFactory   = require('../../factory/client_factory'),
    expect          = require('chai').expect,
    spy             = require('sinon').spy;

describe('Gateway', function(){

    var gateway,
        socket;
    beforeEach(function(){
        gateway = GatewayFactory.create();
        socket = {
            id: 'moo',
            removeAllListeners: function(){},
            on: function(){}
        };
    });

    describe('#onSocketEnd', function(){
        beforeEach(function(){
            client = ClientFactory.create({socket: socket});
            gateway.clients[socket.id] = client;
        });

        it('removes the client', function(){
            spy(client,'dispose');
            gateway.onSocketEnd(socket, false);
            expect(gateway.clients).to.not.have.property(socket.id);
            expect(client.dispose.called).to.be.true;
        });

        it('removes the socket', function(){
            gateway.onSocketEnd(socket, false);
            expect(gateway.sockets).to.not.have.property(socket.id);
        });
    });

    describe('#onSocketConnection', function(){
        it('stores the socket', function(){
            gateway.onSocketConnection(socket);
            expect(gateway.sockets).to.have.property(socket.id, socket);
        });

        it('creates and stores a new client', function(){
            gateway.onSocketConnection(socket);
            expect(gateway.clients).to.have.property(socket.id);
            expect(gateway.clients[socket.id]).to.be.an.instanceOf(GatewayClient);
        });
    });

});