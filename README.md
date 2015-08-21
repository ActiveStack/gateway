ActiveStack Gateway
===================

[![Circle CI](https://circleci.com/gh/ActiveStack/gateway/tree/master.svg?style=svg)](https://circleci.com/gh/ActiveStack/gateway/tree/master)

Introduction
------------

The ActiveStack Gateway is a Node server that sets up a real-time socket server for clients wanting to 
connect to the ActiveStack backend.

Installation
------------

### Prerequisites

* Node = 0.10.x
* Redis
* RabbitMQ

### Install Options

The AS Gateway provides two usage methods:
  * Install globally with NPM: `npm install -g activestack-gateway`. This method will make the `activestack-gateway` executable
    available on your path for starting from the command line.
  * Install in your own node project with `npm install activestack-gateway`. This method will make the gateway available
    to your project at runtime so you can control the gateway from your application.
    
Usage
-------

If you installed the gateway with the global option then you'll have a new executable on your path: `activestack-gateway`.

To start the gateway server with default options run:
```bash
> activestack-gateway server|s
```

To start the gateway console to control an already running server run:
```bash
> activestack-gateway console|c
```

### Console Commands

Once you've started the active stack control console you can issue these commands to control the server:
* `quit` - to quit the console
* `restart` - to restart the server
* `shutdown` - to shut the server down
* `loglevel` - set the log level # Not currently implemented
* `clientmessageresendinterval` - print the client message resend interval configuration
* `clientcount` - print the number of clients connected to the server
    
Configuration
-------------

The AS Gateway allows several different configuration options.  These can be specified using a customer configuration file.

```
# How often should server process send heartbeats to workers
cluster.heartbeatInterval=1000
# How long before a worker times out and is restarted
cluster.workerTimeout=5000
# DON'T KNOW
cluster.watchdogInterval=1000
# Get warned when memory reaches this level
cluster.memoryWarning.rss=1024
# Get warned when memory reaches this level
cluster.memoryWarning.heapTotal=60
# Hard memory limit
cluster.memoryLimit.rss=2048
# Hard memory limit
cluster.memoryLimit.heapUsed=100
# How long to wait before worker is restarted
cluster.workerRestartDelay=50
# Worker backoff
cluster.maxRestartBackoff=10
# The number of workers to spawn. If not specified will use (numCPUs/2)+1
cluster.workerCount=2

# Logging level
frontend.logLevel=info
# Shutdown password
frontend.shutdownCode=pass123
# The port to listen on 
frontend.port=8080
# Use SSL or not
frontend.ssl=false

# Socket IO configurations
gateway.socketio.timeout=300
gateway.socketio.interval=20

# Redis configurations
gateway.redis.host=localhost
gateway.redis.port=6379
gateway.redis.password=
gateway.redis.gatewaycontrolqueue=gateway
gateway.redis.max_attempts=1
gateway.redis.offline_queue=false

# RabbitMQ configurations
gateway.rabbitmq.host=localhost
gateway.rabbitmq.port=5672
gateway.rabbitmq.login=guest
gateway.rabbitmq.password=guest
gateway.rabbitmq.durable=false
```

Running Tests
-------------
```npm test```

API Documentation
-----------------

## ActiveStack Services
- [gateway.js](src/service/gateway.js) - Passed in the Express HTTP Server instance to listen for connect requests on.
    1. Sets up a redis listener for the SocketIO library to use. This is meant to allow each instance of a SocketIO listener to be stateless.
    2. Starts up a SocketIO listener, attaching itself to the ExpressJS HTTP Server instance passed in from [server.js](stc/server.js).
    3. As part of the SocketIO listener, a Flash Policy "Server" is also started for Flash based socket clients.
    4. Creates and starts a new RabbitMQ listener.
    5. Once the RabbitMQ listener is established (i.e. has emitted its `ready` event) the SocketIO has its `connection` listener setup.
    6. SocketIO `connection` listener handles a new client connect request by:
        1. Storing a reference to the socket by its `socket.id`.
        2. Adds listeners to the new socket for `disconnect` and `logout`.
        3. Creates a new [Client](src/service/gateway/client.js), passing in the new socket, RabbitMQ instance, and RabbitMQ exchange.
        4. Once the new [Client](src/service/gateway/client.js) is established it is meant to handle all communication with the client except in the case of a socket `disconnect`/`logout`.

## ActiveStack Client
- [Client](src/service/gateway/client.js)
    1. Creates a new [Session](src/service/gateway/session.js) for the Client.  A Session represents the state of the 
       Client. In order to be stateless, the Session data is encrypted and sent to the client.  The encrypted session data is considered to be the reconnect "key" for any client reconnect attempts.  Whenever the Session data changes, the reconnect "key" is re-packaged and re-sent to the client.
    2. Sets up listeners for:
        1. `message` - Routes the message to all the clients [registered agents](src/service/gateway/agent_adapter/base.js)
        2. `logout` - Routes the logout message to all the clients [registered agents](src/service/gateway/agent_adapter/base.js)
        3. `disconnect` - Routes the disconnect message to all the clients [registered agents](src/service/gateway/agent_adapter/base.js)
        4. `error` - Handles the error accordingly, which potentially means invalidating and disposing of the Client.
        
