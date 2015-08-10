var LoggerFactory   = require('./logger_factory'),
    GatewayWorker         = require('../../src/worker'),
    GatewayFactory = require('./gateway_factory')
    Chance          = require('chance');

/**
 * Client factory for making testing easier
 */
module.exports = {
    /**
     *
     * @param [properties] {Object}
     * @returns {GatewayWorker}
     */
    create: function(properties){
        var chance = new Chance();

        // Mock a bunch of objects it depends on.
        var worker = new GatewayWorker();
        worker.inject(
            LoggerFactory.create(),
            {},
            GatewayFactory.create()
        );

        // Now overwrite with the properties passed in
        for(var key in properties){
            if(worker.hasOwnProperty(key)){
                worker[key] = properties[key];
            }
        }

        return worker;
    }
};
