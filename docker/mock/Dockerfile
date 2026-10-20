FROM --platform=linux/arm64 node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends patch git && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm@11.1.2 && pnpm --version
ARG TYPEGPU_REV=e893ad11f215f08ef164fb20daae851702007185
WORKDIR /work-base
RUN git init -q . && git fetch -q --depth 1 https://github.com/software-mansion/TypeGPU.git "$TYPEGPU_REV" && git checkout -q FETCH_HEAD && rm -rf .git
RUN CI=true pnpm install --frozen-lockfile 2>&1 | tail -40
