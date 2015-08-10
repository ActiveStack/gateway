var GatewayServer = require('./server'),
    AppContext = require('injecterooski').AppContext,
    PrefixedLogger = require('./logging/prefixed_logger'),
    HttpServerFactory = require('./factory/http_server_factory'),
    RabbitMQFactory = require('./factory/rabbitmq_factory'),
    RedisStoreFactory = require('./factory/redis_store_factory'),
    SocketIOFactory = require('./factory/socketio_factory'),
    Properties = require('./config/properties'),
    SSLConfig = require('./config/ssl_config'),
    GatewayWorker = require('./worker'),
    Gateway = require('./service/gateway'),
    SessionFactory = require('./factory/session_factory');

function GatewayServerApplication(){}

GatewayServerApplication.prototype.run = function(configFile){
    var appContext = new AppContext();

    var server = new GatewayServer();

    appContext.register([
        server,
        new PrefixedLogger(),
        new HttpServerFactory(),
        new RabbitMQFactory(),
        new RedisStoreFactory(),
        new SocketIOFactory(),
        new Properties(configFile),
        new SSLConfig(),
        new GatewayWorker(),
        new Gateway(),
        new SessionFactory()
    ]);

    appContext.resolve();

    server.start();
};

module.exports = GatewayServerApplication;
