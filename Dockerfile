FROM node:0.10.48 as app
WORKDIR /opt
COPY . .
RUN npm i
CMD ./docker/boot.sh
