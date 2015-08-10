if [ -n "$1" ]
then
	echo "Deleting key $1"
#	redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` KEYS "$1"
	redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` KEYS $1 | xargs redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` DEL
else
	echo "Deleting ALL keys with pattern: cw:*, com.*.mo.*, omj:*"
#	redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` KEYS "cw:*" | xargs redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` DEL
#	redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` KEYS "com.*.mo.*" | xargs redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` DEL
#	redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` KEYS "omj:*" | xargs redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` DEL
fi