FROM node:6

# directory bootstrap
RUN mkdir -p /srv/app
WORKDIR /srv/app

# copy source
COPY . .

# build
RUN npm install

# run
CMD [ "npm", "start" ]
