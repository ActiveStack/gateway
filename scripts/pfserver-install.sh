#!/bin/bash

# This is the installation script for installing the Percero Framework 
# server side infrasctructure.
#
# !!!! WARNING !!!!
# This script must be run with '. pfserver-install.sh' not './pfserver-install.sh'
#
# This script assumes that all components will be hosted on the same
# AWS instance.
#
# @author - Jonathan Samples - jsamples@spardev.com
#

# Setup some colors
# Text color variables
strong=$(tput bold)              #  Bold
error=$(tput setaf 1)            #  red
good=$(tput setaf 2)             #  green
warn=$(tput setaf 3)             #  yellow
info=$(tput setaf 7)             #  gray
heading=${strong}$(tput setaf 6) #  white
reset=$(tput sgr0)               #  Reset

# Print Header message
function heading {
    echo 
    echo "${heading}========================================================"
    echo "$1"
    echo "========================================================${reset}"
    echo 
}

function fatal {
    echo "${error}$1"
    echo "Installation Failed${reset}"
    echo 
    exit 1
}

function ok {
    echo "${good}Ok"
}

# Check for a prereq
function check {
   echo -n "${info}Checking for $1...................................."
   hash $1 &> /dev/null
}

# Check for a prereq and fail if doesn't exist
function check_fail {
    check $1
    if [[ $? -eq 1 ]]
    then
	fatal "$1 not installed...fail"
    else
	ok
    fi
}

# Check for a prereq and try and install with yum if it doesn't exist
function check_install {
    check $1
    if [[ $? -eq 1 ]]
    then
	echo  "${warn}Installing"
	yum -y -q install $1
	if [[ $? -eq 1 ]]
	then
	    fatal "Could not install $1"
	else
	    ok
	fi
    else
	ok
    fi
}

# Checks for the existance of a file or directory as proof that a package
# is installed... if not install with yum
function check_dir_install {
    echo -n "${info}Checking for $1........................."
    if [ -e $2 ]
    then
	ok
    else
	echo "${warn}Installing"
	yum -y -q install $1
	if [ $? -eq 1 ]
	then
	    fatal "could not install $1"
	else
	    ok
	fi
    fi
}

function check_yum_install {
    echo -n "${info}Checking for $1........."
    if (yum list installed $1 > /dev/null >& /dev/null)
    then
	echo -n "....................."
	ok
    else
	echo -n "${warn}Installing"
	yum -y -q install $1
	if [ $? -eq 1 ]
	then
	    fatal "could not install $1"
	else
	    echo -n "${reset}..."
	    ok
	fi
    fi
}

function redis_install {
	mkdir -p /tmp/redis
	cd /tmp/redis
	wget http://redis.googlecode.com/files/redis-2.4.15.tar.gz > /dev/null &> /dev/null
	tar xvzf redis-2.4.15.tar.gz > /dev/null &> /dev/null
	cd redis-2.4.15
	make > /dev/null &> /dev/null
	mkdir -p /etc/redis /var/lib/redis
	cp src/redis-server src/redis-cli /usr/local/bin
	cp redis.conf /etc/redis

	sed -i 's/^daemonize.*$/daemonize yes/g' /etc/redis/redis.conf
	sed -i 's/^# bind .*$/bind 127.0.0.1/g' /etc/redis/redis.conf
	sed -i 's/^loglevel .*$/loglevel notice/g' /etc/redis/redis.conf
	sed -i 's/^logfile .*$/logfile \/var\/log\/redis\.log/g' /etc/redis/redis.conf
	sed -i 's/^dir .*$/dir \/var\/lib\/redis/g' /etc/redis/redis.conf

	wget --no-check-certificate https://raw.github.com/gist/257849/9f1e627e0b7dbe68882fa2b7bdb1b2b263522004/redis-server > /dev/null &> /dev/null

	sed -i 's/^redis="\/usr.*$/redis="\/usr\/local\/bin\/redis-server"/g' redis-server 
	mv redis-server /etc/init.d
	chmod 755 /etc/init.d/redis-server
	chkconfig --add redis-server > /dev/null &> /dev/null
	chkconfig --level 345 redis-server on > /dev/null &> /dev/null

	echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf

	sysctl vm.overcommit_memory=1 > /dev/null &> /dev/null
	service redis-server start > /dev/null &> /dev/null
	rm -rf /tmp/redis
}

heading "Installing PF Server - Be patient, it might be a while"

# First verify the OS
echo -n "${info}Checking OS Version..."
if [ -e "/etc/redhat-release" ]
then
    version=`cat /etc/redhat-release`
    if [[ "$version" =~ (6\.[0-9]+) ]]
    then
	echo -n " ${info}CentOS v${BASH_REMATCH[0]}.................."
	ok
    else
	echo " ${warn}$version........................Ok but untested"
    fi
else
    fatal "Unsupported OS"
fi

# verify redis-server 
echo -n "${info}Checking for redis-server..."
if [ -f /etc/redis/redis.conf ];
then
   echo -n "${info}.................."
   ok
else
   echo -n "${info}installing .................."
   redis_install  
   ok
fi

# Next, verify that yum exists
check_fail "yum"
# Next, check for emacs and install if not.. why? because I like it thats why
check_yum_install "emacs"
# Next, check for git
check_yum_install "git"
# Next, check for erlang (required by rabbitmq)
check_yum_install "erlang"
# Next, check for open SSL devel package (required by Node)
check_yum_install "openssl-devel"


# Next, checkout node and install
check "node"
if [ $? -eq 1 ]
then
    echo "${warn}Installing${info}"
    echo "Checking out Node from git......................"
    cd /opt && git clone -q git://github.com/joyent/node.git > /dev/null &> /dev/null
    cd /opt/node && git checkout tags/v0.6.19 > /dev/null &> /dev/null

    # Checking that the process completed successfully doesn't work in 
    # this case
    if [ -e /opt/node/configure ]
    then
	ok
	echo "${info}Building and Installing Node......................"
	if (cd /opt/node && ./configure && make && make install)
	then
	    ok
	    check_fail "node"
	else
	    fatal "Installation of Node failed"
	fi
    else
	fatal "Could not checkout Node"
    fi
else
    ok
fi

# Next, install RabbitMQ
check_yum_install "rabbitmq-server"

# Next, install NPM (probably don't need it but for good measure)
check "npm"
if [ $? -eq 1 ]
then
    echo -n "${warn}installing"
    if (curl http://npmjs.org/install.sh | sh > /dev/null >& /dev/null)
    then
	if(check "npm")
	then
	    echo -n "......"
	    ok
	else
	    fatal "Could not install npm"
	fi
    else
	fatal "Npm install script failed"
    fi
else
    ok
fi
    
# Next, Java JDK
check_yum_install "java-1.6.0-openjdk-devel"

# Next, maven
check "mvn"
if [ $? -eq 1 ]
then
    echo -n "${warn}installing..."
    #Download the binary tarball
    if (cd /tmp && wget -q http://www.takeyellow.com/apachemirror//maven/binaries/apache-maven-3.0.3-bin.tar.gz > /dev/null >& /dev/null)
    then
	# Remove the install dir if it is already there
	if [ -e /usr/local/apache-maven-3.0.3 ]
	then
	    rm -rf /usr/local/apache-maven-3.0.3
	fi

	# Remove the symlink if it is already there
	if [ -e /usr/local/maven ]
	then
	    rm -f /usr/local/maven
	fi

	# Extract it to /usr/local and make a convenience symlink
	if(cd /usr/local && tar -zxf /tmp/apache-maven-3.0.3-bin.tar.gz && ln -s apache-maven-3.0.3 maven > /dev/null >& /dev/null) 
	then
	    # Install the env variables
	    if(egrep -in "^export M2_HOME.*$" /root/.bash_profile > /dev/null)
	    then
		# If env variables already in the bash_profile file, the replace whats already there
		sed -i 's/^export M2_HOME=.*$/export M2_HOME=\/usr\/local\/maven/g' /root/.bash_profile
		sed -i 's/^export M2=.*$/export M2=$M2_HOME\/bin/g' /root/.bash_profile
	    else
		# If env variables not in the bash_profile then append them to the file
		echo 'export M2_HOME=/usr/local/maven' >> /root/.bash_profile
		echo 'export M2=$M2_HOME/bin' >> /root/.bash_profile
		echo 'export PATH=$M2:$PATH' >> /root/.bash_profile
	    fi
	    
	    . /root/.bash_profile

	    if [ $? -eq 1 ]
	    then
		fatal "Could not install mvn"
	    else
		ok
	    fi
	else
	    fatal "Could not extract tarball"
	fi
    else
	fatal "Couldn't download maven"
    fi
else
    ok
fi

# Next, check for a proper default private key
echo -n "${info}Checking for default Private Key.........."
if [ -e /root/.ssh/id_rsa ] || [ -e /root/.ssh/id_dsa ]
then 
    ok
else
    echo "${error}fail"
    fatal "No default private key.  To remedy, place a private key in /root/.ssh called id_rsa or id_dsa depending on the type of it's encryption"
fi

# Now, finally we can checkout the code from git
echo -n "${info}Checking for PF Server....................."
if [ -e /opt/pfserver ]
then
    ok
else
    echo -n "${warn}Checking out"
    if(cd /opt && git clone git@git.assembla.com:percero-platform-development.git pfserver)
    then
	git checkout redis 
	ok
    else
	fatal "Couldn't checkout code. Most likely you haven't setup the Public/Private keys properly. The git client expects to use the rsa_id or dsa_id private key"
    fi
fi

echo -n "${info}Checking for existing config...."
if [ ! -e /etc/pfserver ]
then
    echo -n "${warn}making dir..."
    mkdir /etc/pfserver
fi

if [ -e /etc/pfserver/env.properties ]
then
    ok
else
    echo -n "${warn}copying default${info}..."
    cp -p /opt/pfserver/javascript/rabbit/resources/env.properties /etc/pfserver/env.properties
    ok
fi


# If we get here then all of the rest was successful
echo 
echo "${good}Install Successful${reset}"
