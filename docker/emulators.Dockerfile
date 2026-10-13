# Firebase Emulator Suite (Auth + Firestore + UI) for the local test environment.
# Debian trixie ships Java 21, which current firebase-tools requires.
FROM node:22-trixie-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
 && rm -rf /var/lib/apt/lists/*

# Keep in sync with the firebase-tools devDependency in package.json.
ARG FIREBASE_TOOLS_VERSION=15.24.0
RUN npm install -g firebase-tools@${FIREBASE_TOOLS_VERSION} \
 && firebase setup:emulators:firestore \
 && firebase setup:emulators:ui

WORKDIR /work
COPY docker/firebase.json docker/emulators-entrypoint.sh ./
RUN chmod +x emulators-entrypoint.sh

ENTRYPOINT ["/work/emulators-entrypoint.sh"]
