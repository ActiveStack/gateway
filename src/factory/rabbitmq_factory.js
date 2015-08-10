var amqp = require('amqp');

function RabbitMQFactory(){}
module.exports = RabbitMQFactory;

RabbitMQFactory.prototype.inject = function(properties){
    this.properties = properties;
};

RabbitMQFactory.prototype.create = function(){
    return amqp.createConnection({
        host: this.properties['gateway.rabbitmq.host'],
        port: this.properties['gateway.rabbitmq.port'],
        login: this.properties['gateway.rabbitmq.login'],
        password: this.properties['gateway.rabbitmq.password']
    });
}