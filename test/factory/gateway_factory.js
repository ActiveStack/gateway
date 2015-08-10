var loggerFactory   = require('./logger_factory'),
    sessionFactory  = require('./session_factory'),
    Gateway         = require('../../src/service/gateway'),
    Chance          = require('chance');

/**
 * Client factory for making testing easier
 */
module.exports = {
    /**
     *
     * @param [properties] {Object}
     * @returns {Gateway}
     */
    create: function(properties){
        properties = properties || {};
        var chance = new Chance();

        // Mock a bunch of objects it depends on.
        var httpServerFactory = {};
        var redisStoreFactory = {};
        var socketioFactory = {};
        var rabbitmqFactory = {};
        var gatewayWorker = {
            catchAndWarn: function(){}
        };

        var ssl = {};

        var logger = loggerFactory.create();

        var gateway = new Gateway();
        gateway.inject(
            httpServerFactory,
            properties,
            ssl,
            logger,
            redisStoreFactory,
            socketioFactory,
            rabbitmqFactory,
            gatewayWorker,
            sessionFactory
        );

        // Don't call init because don't want to initialize anything
        // we don't have to. But we do need the httpServer mocked
        gateway.httpServer = {
            listen: function(){}
        };

        // Now overwrite with the properties passed in
        for(var key in properties){
            if(gateway.hasOwnProperty(key)){
                gateway[key] = properties[key];
            }
        }

        return gateway;
    }
};
