
var Session = require('../../../src/service/session'),
    SessionFactory = require('../../factory/session_factory'),
    expect = require('chai').expect,
    TimeKeeper = require('timekeeper');

describe('Session', function(){
    var session;
    beforeEach(function(){ session = SessionFactory.create() });

    describe('#isLoggedIn', function(){
        it('will return true when session has userId', function(){
            session.userId = 'foobar';
            expect(session.isLoggedIn()).to.equal(true);
        });
        it('will return false when session has no userId', function(){
            session.userId = null;
            expect(session.isLoggedIn()).to.equal(false);
        });
    });

    describe('#clone', function(){
        function verify(clone){
            Session.content_keys.forEach(function(key){
                expect(clone[key]).to.equal(session[key]);
            });
        }
        it('will result with an object with session properties and values appended', function(){
            var clone = session.clone();
            verify(clone);
        });

        it('will result with passed in properties', function(){
            var clone = session.clone({other: 'beep'});
            verify(clone);
            expect(clone['other']).to.equal('beep');
        });

        it('will have passed in properties overwritten by session', function(){
            var clone = session.clone({userId: 'beep'});
            verify(clone);
        });
    });

    describe('#isDirtyAsync', function(){
        it('will call the callback with true when dirty', function(done){
            session.isDirtyAsync(function(isDirty){
                expect(isDirty).to.equal(true);
                done();
            });
        });
        it('will call the callback with false when not dirty', function(done){
            session._dirty = false;
            session.isDirtyAsync(function(isDirty){
                expect(isDirty).to.equal(false);
                done();
            });
        });
        it('will process pending updates before callback is called', function(done){
            session._dirty = false;

            // Pending update to session
            process.nextTick(function(){
                session.userId = 'cow';
            });

            // Make sure it is still not dirty
            expect(session._dirty).to.equal(false);

            session.isDirtyAsync(function(isDirty){
                expect(isDirty).to.equal(true);
                done();
            });
        });
    });

    describe('#getSignedSession', function(){
        it('will set dirty to false', function(){
            session.getSignedSession();
            expect(session._dirty).to.equal(false);
        });
    });

    describe('#load', function(){

        it('will return false if signedSession not a string', function(){
            expect(session.load(new Date())).to.equal(false);
        });

        it('will return false if invalid format', function(){
            expect(session.load('moo cow')).to.equal(false);
        });

        it('will return false for an expired token', function(){
            TimeKeeper.freeze(new Date(0));
            var session2 = SessionFactory.create();
            var signedSession = session2.getSignedSession();
            TimeKeeper.reset();
            expect(session.load(signedSession)).to.equal(false);
        });

        it('will decode a signed session and copy its properties to this session', function(){
            var session2 = SessionFactory.create();
            var signedSession = session2.getSignedSession();
            session.load(signedSession);
            Session.content_keys.forEach(function(key){
               expect(session[key]).to.equal(session2[key]);
            });

            expect(session._dirty).to.equal(true);
        });
    });

    describe('#logout', function(){
        it('will set token and userId to undefined', function(done){
            expect(session.token).to.not.be.undefined;
            expect(session.userId).to.not.be.undefined;

            session.logout();

            expect(session.token).to.not.be.undefined;
            expect(session.userId).to.not.be.undefined;

            process.nextTick(function(){
                expect(session.token).to.be.undefined;
                expect(session.userId).to.be.undefined;
                done();
            });
        });
    });
});