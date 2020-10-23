FROM node:0.10.48

RUN npm i -g activestack-gateway

WORKDIR /opt

COPY ./docker ./docker

CMD activestack-gateway s ./docker/env.properties