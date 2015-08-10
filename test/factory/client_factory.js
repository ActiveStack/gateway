var loggerFactory   = require('./logger_factory'),
    GatewayClient   = require('../../src/service/client'),
    Chance          = require('chance'),
    sessionFactory  = require('./session_factory');

/**
 * Client factory for making testing easier
 */
module.exports = {
    /**
     *
     * @param [properties] {Object}
     * @returns {GatewayClient}
     */
    create: function(properties){
        properties = properties || {};
        var chance = new Chance();

        // Mock a bunch of objects it depends on.
        var socket = {
            on: function(){},
            emit: function(){},
            id: chance.string()
        };
        var exchange = {
            publish: function(){}
        };
        var rabbitmq = {
            queue: function(name, options, callback){
                var queue = {
                    on: function(){ return this },
                    subscribe: function(){}
                };
                callback(queue);
                return queue;
            }
        };
        var logger = loggerFactory.create();
        var config = {};

        var client = new GatewayClient(socket, exchange, rabbitmq, logger, config, sessionFactory);

        // Now overwrite with the properties passed in
        for(var key in properties){
            if(client.hasOwnProperty(key)){
                client[key] = properties[key];
            }
        }

        return client;
    }
};
