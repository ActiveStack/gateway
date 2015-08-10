var loggerFactory   = require('./logger_factory'),
    Session         = require('../../src/service/session'),
    Chance          = require('chance');

/**
 * Session factory for making testing easier
 */
module.exports = {
    /**
     *
     * @param [properties] {Object}
     * @returns {Session}
     */
    create: function(properties){
        properties = properties || {};
        config = {
            'frontend.session_secret':'moo cow'
        };
        var chance = new Chance();
        var session = new Session(loggerFactory.create(), config);
        session.userId   = chance.string();
        session.clientId = chance.string();
        session.existingClientId = chance.string();
        session.deviceId = chance.string();
        session.token = chance.string();

        // Now overwrite with the properties passed in
        for(var key in properties){
            if(session.hasOwnProperty(key)){
                session[key] = properties[key];
            }
        }

        return session;
    }
};
