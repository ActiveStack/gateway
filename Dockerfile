FROM node:0.10.48 as base
WORKDIR /app
COPY *json /app/
ENTRYPOINT ['npm'. 'start']

FROM base as test
RUN npm install
COPY src /app/src/
COPY test /app/test/
USER node
ENTRYPOINT ["npm", "test"]

FROM base as app
RUN npm install --production
USER node
ENTRYPOINT ["npm", "start", "s", "./docker/env.properties"]
ARG VERSION_TAG=undefined
LABEL VERSION_TAG=$VERSION_TAG
