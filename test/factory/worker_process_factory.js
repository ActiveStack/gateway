var spy     = require('sinon').spy,
    Chance  = require('chance');

/**
 * Client factory for making testing easier
 */
module.exports = {
    /**
     * @returns {Object}
     */
    create: function(){
        var chance = new Chance();

        // Mock a bunch of objects it depends on.
        return {
            disconnect: spy(),
            destroy: spy(),
            send: spy(),
            process:{
                pid: chance.natural()
            },
            on: spy()
        };
    }
};
