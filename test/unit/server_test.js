var GatewayServer   = require('../../src/server'),
    LoggerFactory   = require('../factory/logger_factory'),
    WorkerFactory   = require('../factory/worker_factory'),
    WPFactory       = require('../factory/worker_process_factory'),
    expect          = require('chai').expect,
    spy             = require('sinon').spy,
    stub            = require('sinon').stub,
    cluster         = require('cluster');

describe('Server', function(){
    var server;
    beforeEach(function(){
        server = new GatewayServer();
        server.inject(
            LoggerFactory.create(),
            {},
            WorkerFactory.create()
        );
    });
    describe('#start', function(){
        var isMaster;
        beforeEach(function(){
            stub(server,'isMaster',function(){ return isMaster });
            spy(server, 'startMaster');
            spy(server, 'startWorker');
        });
        afterEach(function(){
            server.isMaster.restore();
        });
        it('starts master process when master', function(){
            isMaster = true;
            server.properties['cluster.workerCount'] = 2;
            server.start();
            expect(server.startMaster.called).to.be.true;
        });

        it('starts worker process when workerCount = 1', function(){
            isMaster = true;
            server.properties['cluster.workerCount'] = 1;
            server.start();
            expect(server.startWorker.called).to.be.true;
        });

        it('starts worker process when not master', function(){
            isMaster = false;
            server.properties['cluster.workerCount'] = 2;
            server.start();
            expect(server.startWorker.called).to.be.true;
        });
    });

    describe('#onIPCShutdown', function(){
        beforeEach(function(){
            stub(server,'stopWorkerProcesses');
            server.properties['frontend.shutdownCode'] = 'moo';

        });
        it('will stop worker processes when shutdown code correct', function(){
            server.onIPCShutdown([null, 'moo']);
            expect(server.stopWorkerProcesses.called).to.be.true;
        });
        it('will return early if code is wrong', function(){
            server.onIPCShutdown([null, 'boo']);
            expect(server.stopWorkerProcesses.called).to.be.false;
        });
    });

    describe('#onIPCRestart', function(){
        beforeEach(function(){
            stub(server,'restartWorkerProcesses');
            server.properties['frontend.shutdownCode'] = 'moo';
        });
        it('will stop worker processes', function() {
            server.onIPCRestart([null, 'moo']);
            expect(server.restartWorkerProcesses.called).to.be.true;
        });
    });

    describe('#restartWorkerProcesses', function(){
        var type = 'soft',
            worker1, worker2,
            origSetTimeout;
        beforeEach(function(){
            origSetTimeout = setTimeout;
            setTimeout = stub();
            spy(server,'hardStopWorkerProcess');
            worker1 = WPFactory.create();
            worker2 = WPFactory.create();
            server.workers = [worker1, worker2];
        });
        afterEach(function(){ setTimeout = origSetTimeout; })
        it('resets the workers array', function(){
            server.restartWorkerProcesses(type, 100);
            expect(server.workers).to.be.empty
        });
        describe('type=immediate', function(){
            beforeEach(function(){ type='immediate' });
            it('will use 500 default delay', function(){
                server.restartWorkerProcesses(type, null);
                expect(server.hardStopWorkerProcess.calledWith(worker1, 0)).to.be.true;
                expect(server.hardStopWorkerProcess.calledWith(worker2, 500)).to.be.true;
            });
            it('will use passed in delay', function(){
                server.restartWorkerProcesses(type, 20);
                expect(server.hardStopWorkerProcess.calledWith(worker1, 0)).to.be.true;
                expect(server.hardStopWorkerProcess.calledWith(worker2, 20)).to.be.true;
            });
        });

        describe('type=otherwise', function(){
            it('will send restart to all workers', function(){
                server.restartWorkerProcesses(type, 20);
                expect(worker1.send.calledWith({cmd: 'restart', type: 'on_client_queue_empty', data: 20}));
                expect(worker2.send.calledWith({cmd: 'restart', type: 'on_client_queue_empty', data: 20}));
            });
        });
    });

    describe('#hardStopWorkerProcess', function(){
        it('will call disconnect and destroy after the delay', function(done){
            var worker = WPFactory.create();
            server.hardStopWorkerProcess(worker, 5);
            expect(worker.disconnect.called).to.be.false;
            expect(worker.destroy.called).to.be.false;

            setTimeout(function(){
                expect(worker.disconnect.called).to.be.true;
                expect(worker.destroy.called).to.be.true;
                done();
            },6);
        });
    });

    describe('#stopWorkerProcesses', function(){
        var origExit;
        beforeEach(function(){
            origExit = process.exit;
            process.exit = spy();
            server.workers = [
                WPFactory.create(),
                WPFactory.create()
            ]
        });
        afterEach(function(){
            process.exit = origExit;
        });
        it('will hard stop all worker and exit when type=immediate', function(){
            server.stopWorkerProcesses('immediate', 0);
            server.workers.forEach(function(worker){
                expect(worker.disconnect.called).to.be.true;
                expect(worker.destroy.called).to.be.true;
            });
            expect(process.exit.called).to.be.true;
        });

        it('will send stop message to all workers for type=otherwise', function(){
            server.stopWorkerProcesses('otherwise', 10);
            server.workers.forEach(function(worker){
                expect(worker.send.calledWith(
                    {cmd: 'stop', type: 'on_client_queue_empty', data: 10}
                )).to.be.true;
            });
            expect(process.exit.called).to.be.false;
        });
    });

    describe('#stopAndRemoveWorkerProcess', function(){
        var worker = WPFactory.create();
        beforeEach(function(){
            server.workers = [
                WPFactory.create(),
                worker,
                WPFactory.create()
            ];
        });
        it('removes the worker from its list', function(){
            server.stopAndRemoveWorkerProcess(worker);
            expect(server.workers).to.not.include(worker);
            expect(server.workers).to.have.length(2);
        });
        it('Does not remove an unknown worker', function(){
            server.stopAndRemoveWorkerProcess(WPFactory.create());
            expect(server.workers).to.have.length(3);
        });
    });

    describe('#setLogLevel', function(){
        beforeEach(function(){
            server.workers = [
                WPFactory.create(), WPFactory.create()
            ];
        });
        it('will send logLevel to all child processes', function(){
            server.setLogLevel('info');
            server.workers.forEach(function(worker){
                expect(worker.send.calledWith(
                    {cmd: 'logLevel', data: 'info'}
                )).to.be.true;
            });
        });
    });

    describe('#onWorkerProcessMessageHearthbeat', function(){
        var worker,
            message,
            MEGABYTE = 1024*1024;
        beforeEach(function(){
            server.properties['cluster.memoryLimit.rss'] = 2;
            worker = WPFactory.create();
            message = {
                memory:{
                    rss: 1*MEGABYTE
                }
            };
            spy(server,'stopAndRemoveWorkerProcess');
        });

        it('sets gotFirstHeartBeat=true', function(){
            server.onWorkerProcessMessageHeartbeat(worker, message);
            expect(worker.gotFirstHeartbeat).to.be.true;
        });

        it('does not stop process when not exceeding the memory limit', function(){
            server.onWorkerProcessMessageHeartbeat(worker, message);
            expect(server.stopAndRemoveWorkerProcess.called).to.be.false;
        });

        it('stops the process when exceeding memory limit', function(){
            message.memory.rss = 3*MEGABYTE;
            server.onWorkerProcessMessageHeartbeat(worker, message);
            expect(server.stopAndRemoveWorkerProcess.called).to.be.true;
        });
    });

    describe('#onWorkerProcessMessageStop', function(){
        var worker;
        beforeEach(function(){
            worker = WPFactory.create();
            server.workers = [worker];
            stub(process,'exit');
        });
        afterEach(function(){
            process.exit.restore();
        });
        it('exits if worker queue empty', function(){
            server.onWorkerProcessMessageStop(worker, {});
            expect(process.exit.called).to.be.true;
        });
    });

    describe('#onWorkerProcessMessage', function(){
        var worker;
        beforeEach(function(){
            worker = WPFactory.create();
            stub(process,'exit');
        });
        afterEach(function(){
            process.exit.restore();
        });
        it('routes message to heartbeat', function(){
            spy(server,'onWorkerProcessMessageHeartbeat');
            server.onWorkerProcessMessage(worker,{ command: 'heartbeat' });
            expect(server.onWorkerProcessMessageHeartbeat.called).to.be.true;
        });
        it('routes message to disconnect', function(){
            spy(server,'onWorkerProcessMessageDisconnect');
            server.onWorkerProcessMessage(worker,{ command: 'disconnect' });
            expect(server.onWorkerProcessMessageDisconnect.called).to.be.true;
        });
        it('routes message to stop', function(){
            spy(server,'onWorkerProcessMessageStop');
            server.onWorkerProcessMessage(worker,{ command: 'stop' });
            expect(server.onWorkerProcessMessageStop.called).to.be.true;
        });
        it('routes message to restart', function(){
            spy(server,'onWorkerProcessMessageRestart');
            server.onWorkerProcessMessage(worker,{ command: 'restart' });
            expect(server.onWorkerProcessMessageRestart.called).to.be.true;
        });

        it('routes message to clientcount', function(){
            spy(server,'onWorkerProcessMessageClientCount');
            server.onWorkerProcessMessage(worker,{ command: 'clientCount' });
            expect(server.onWorkerProcessMessageClientCount.called).to.be.true;
        });
    });

    describe('#onWorkerProcessExit', function(){
        var worker;
        beforeEach(function(){
            worker = WPFactory.create();
            server.workers = [worker];
        });
        it('removes the worker from the list', function(){
            server.onWorkerProcessExit(worker, 20, 0);
            expect(server.workers).to.not.include(worker);
        });
    });

    describe('#createWorkerProcess', function(){
        beforeEach(function(){
            server.workerCount = 2;
            server.workers = [WPFactory.create()];
            stub(cluster,'fork', function(){ return WPFactory.create(); });
        });
        afterEach(function(){
            cluster.fork.restore();
        });

        it('forks a new child process when worker count not full', function(){
            server.createWorkerProcess(false);
            expect(cluster.fork.called).to.be.true;
            expect(server.workers).to.have.length(2);
        });

        it('does not fork when worker count full', function(){
            server.workers.push(WPFactory.create());
            server.createWorkerProcess(false);
            expect(cluster.fork.called).to.be.false;
            expect(server.workers).to.have.length(2);
        });

        it('forks when worker count full and is forced', function(){
            server.workers.push(WPFactory.create());
            server.createWorkerProcess(true);
            expect(cluster.fork.called).to.be.true;
            expect(server.workers).to.have.length(3);
        });
    });
});