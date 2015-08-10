if [ -n "$1" ]
then
	echo "Deleting key $1"
	redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` KEYS $1 | xargs redis-cli -h `sed '/^\#/d' /etc/pfserver/env.properties | grep "^redis.host" -m 1 | sed 's/^.*=//'` DEL
fi
