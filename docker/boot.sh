# Set ENV Vars
./docker/config/env.properties.tpl.sh > ./docker/config/env.properties
cat ./docker/config/env.properties

# activestack-gateway s ./docker/config/env.properties
npm start s ./docker/config/env.properties
