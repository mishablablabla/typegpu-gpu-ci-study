#   docker build --build-arg BASE=tgci-ex-lavapipe:arm64   -f examples-runner/docker/Dockerfile -t tgci-p3-examples-lavapipe:arm64   examples-runner/docker/ctx
#   docker build --build-arg BASE=tgci-ex-swiftshader:arm64 -f examples-runner/docker/Dockerfile -t tgci-p3-examples-swiftshader:arm64 examples-runner/docker/ctx
ARG BASE
FROM ${BASE}
RUN npm install -g pnpm@11.1.2 --no-audit --no-fund 2>&1 | tail -2
WORKDIR /work/ex
COPY typegpu-HEAD /work/ex/typegpu
RUN cd /work/ex/typegpu && pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -3
COPY runner/package.json runner/package-lock.json /work/ex/runner/
RUN cd /work/ex/runner && npm install --no-audit --no-fund 2>&1 | tail -2
COPY runner /work/ex/runner
COPY in-container.sh /work/ex/in-container.sh

