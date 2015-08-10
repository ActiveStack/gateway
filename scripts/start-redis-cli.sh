redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'`
