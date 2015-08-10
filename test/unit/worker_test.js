var WorkerFactory   = require('../factory/worker_factory')
    expect          = require('chai').expect,
    spy             = require('sinon').spy;

describe('Worker', function(){
    var worker;
    beforeEach(function(){
        worker = WorkerFactory.create();
    });
    describe('#checkMemoryUsage', function(){
        it('does not throw an error', function(){
            expect(worker.checkMemoryUsage.bind(worker)).to.not.throw(Error);
        });
    });
    describe('#sendMessage', function(){
        describe('command=clientQueueLength', function(){
            var origProcessSend;
            beforeEach(function(){
                origProcessSend = process.send;
                process.send = spy();
            });
            afterEach(function(){
                process.send = origProcessSend;
            });
            it('sends a restart message if restartOnClientQueueEmpty', function(){
                worker.restartOnClientQueueEmpty = true;
                worker.sendMessage({
                    command: 'clientQueueLength',
                    data: 0
                });
                expect(process.send.calledWith({command:'restart'}));
            });
            it('sends a stop message if stopClientOnClientQueueEmpty', function(){
                worker.stopOnClientQueueEmpty = true;
                worker.sendMessage({
                    command: 'clientQueueLength',
                    data: 0
                });
                expect(process.send.calledWith({command:'stop'}));
            });
        });
    });

    ['stop','restart'].forEach(function(cmd){
        describe('#onMessageStopOrRestart:'+cmd, function(){
            var message,
                origProcessSend;
            beforeEach(function(){
                message = {
                    cmd: cmd,
                    type: 'on_client_queue_empty',
                    data: 1
                };
                origProcessSend = process.send;
                process.send = spy();
            });
            afterEach(function(){
                process.send = origProcessSend;
            });

            describe('type=on_client_queue_empty', function(){
                it('calls gateway.onShutdown', function(){
                    spy(worker.gateway,'onShutdown');
                    worker.onMessageStopOrRestart(message);
                    expect(worker.gateway.onShutdown.called).to.be.true;
                });
                it('will send restart message when client queue empty', function(){
                    worker.onMessageStopOrRestart(message);
                    expect(process.send.calledWith({command:cmd})).to.be.true;
                });
                it('will wait message.data millis and then send restart message', function(done){
                    worker.currentClientQueueLength = 1;
                    worker.onMessageStopOrRestart(message);
                    expect(process.send.called).to.be.false;
                    setTimeout(function(){
                        expect(process.send.calledWith({command:cmd})).to.be.true;
                        done();
                    },5);
                });

                it('will not send message when data=0', function(done){
                    worker.currentClientQueueLength = 1;
                    message.data = 0;
                    worker.onMessageStopOrRestart(message);
                    expect(process.send.called).to.be.false;
                    setTimeout(function(){
                        expect(process.send.calledWith({command:cmd})).to.be.false;
                        done();
                    },5);
                });
            });

            describe('type=anything else', function(){
                it('will send the '+cmd+' message', function(){
                    message.type = 'anything_else';
                    worker.onMessageStopOrRestart(message);
                    expect(process.send.calledWith({command:cmd})).to.be.true;
                });
            });
        });
    });

    describe('#onMessageLogLevel', function(){
        it('throws an error', function(){
            expect(worker.onMessageLogLevel).to.throw(Error);
        });
    });

    describe('#onMessageCMSI', function(){
        it('sets the resend interval', function(){
            worker.properties['frontend.clientMessageResendInterval'] = 1;
            worker.onMessageCMSI({data: 2});
            expect(worker.properties['frontend.clientMessageResendInterval']).to.equal(2);
        });
    });

    describe('#onMessageClientCount', function(){
        var origProcessSend;
        beforeEach(function(){
            origProcessSend = process.send;
            process.send = spy();
        });
        afterEach(function(){
            process.send = origProcessSend;
        });

        it('will send the client count back to the master process', function(){
            worker.onMessageClientCount({});
            expect(process.send.calledWith(
                {command: 'clientCount', data: worker.currentClientQueueLength})).to.be.true;
        });
    });

    describe('#createErrorHandler', function(){
        it('returns a function', function(){
            expect(worker.createErrorHandler('blah')).to.be.a('function');
        });
    });

    describe('#catchAndWarn', function(){
        it('will not raise an error', function(){
            expect(function(){
                worker.catchAndWarn('a message', function(){ throw new Error(); })
            }).to.not.throw(Error);
        });
    });
});