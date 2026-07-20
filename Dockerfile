FROM apify/actor-node:22

RUN npm ls crawlee apify impit 2>/dev/null || true

COPY --chown=myuser:myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --omit=dev \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && rm -r ~/.npm

COPY --chown=myuser:myuser . ./

CMD npm start --silent
