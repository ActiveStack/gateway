FROM node:0.10.48 as app
RUN npm i -g activestack-gateway
WORKDIR /opt

COPY ./docker ./docker
CMD ./docker/boot.sh
