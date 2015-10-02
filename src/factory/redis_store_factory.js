//var RedisStore = require('socket.io/lib/stores/redis');
var redis = require('socket.io-redis');

function RedisStoreFactory(){}; module.exports = RedisStoreFactory;

RedisStoreFactory.prototype.inject = function(properties){
    this.properties = properties;
};

/**
 *
 * @returns {RedisStore}
 */
RedisStoreFactory.prototype.instance = function(){
    if(!this.redisStore){
        var options = {
            host: this.properties['gateway.redis.host'],
            port: this.properties['gateway.redis.port'],
            max_attempts: this.properties['gateway.redis.max_attempts'],
            enable_offline_queue: this.properties['gateway.redis.offline_queue'] == 'true'
        };
        //
        //this.redisStore = new RedisStore({
        //    redisPub: redisOptions,
        //    redisSub: redisOptions,
        //    redisClient: redisOptions
        //});
        //
        //this.redisStore.pub.auth(this.properties['gateway.redis.password']);
        //this.redisStore.sub.auth(this.properties['gateway.redis.password']);
        //this.redisStore.cmd.auth(this.properties['gateway.redis.password']);
        this.redisStore = redis(options);
    }

    return this.redisStore;
}