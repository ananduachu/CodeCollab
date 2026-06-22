# Collaborative Coding Interface

A Vite + React application for collaborative coding workflows, with Firebase-backed features, code execution tooling, and supporting services for networking, database fallbacks, and email delivery.

## What is in this repo

- Main web app in `src/`
- Local dev API in `dev-server/`
- Cloud functions in `functions/`
- Firebase configuration in the root files
- A landing page project in `landing/`
- An additional package scaffold in `codecollab01/`

## Prerequisites

- Node.js 18 or newer
- npm
- Firebase project configuration if you are using the backend features

## Install

```bash
npm install
```

## Run locally

Start the frontend only:

```bash
npm run dev
```

Start the local API only:

```bash
npm run start:api
```

Start both together:

```bash
npm run start:both
```

## Build

```bash
npm run build
```

## Available scripts

- `npm run dev` - start the Vite dev server
- `npm run dev:network` - start the Vite dev server on the network host
- `npm run build` - create a production build
- `npm run start:api` - run the local API server in `dev-server/server.js`
- `npm run start:both` - run the API and frontend together
- `npm run network:test` - run the network test script
- `npm run network:info` - print local IPv4 addresses

## Project layout

- `src/` - application source code
- `src/components/` - UI components
- `src/contexts/` - React context providers
- `src/services/` - service layer code
- `src/styles/` - shared styles
- `dev-server/` - local backend utilities and server entry point
- `functions/` - Firebase or serverless function code
- `dataconnect/` - Data Connect schema and seed files
- `landing/` - separate landing page app
- `public/` - static assets

## Notes

- Generated code lives under `src/dataconnect-generated/` and should be treated as build output or synced artifacts.
- Firebase rules and indexes are committed at the repository root.
- If you are working on local backend features, check the relevant files in `dev-server/`, `functions/`, and the Firebase config files before changing runtime behavior.
