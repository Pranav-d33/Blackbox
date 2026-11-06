# Blackbox, hosted: the core (Node, serves the console + API) and the robot (Python, MuJoCo) in one container.
# Only the core's port is exposed; the robot listens on 127.0.0.1 and is never reachable from outside.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# python deps first (cached). PyBullet is optional and compiles from source, so it is left out: the robot falls back to its native integrator.
COPY robot/requirements.txt robot/requirements.txt
RUN python3 -m venv robot/.venv \
 && grep -vi '^pybullet' robot/requirements.txt > /tmp/req.txt \
 && robot/.venv/bin/pip install --no-cache-dir -r /tmp/req.txt

# node deps
COPY core/package.json core/package-lock.json core/
RUN npm --prefix core ci

COPY core core
COPY robot robot
COPY scenarios scenarios
COPY scripts/start-hosted.sh scripts/start-hosted.sh

ENV NODE_ENV=production \
    PUBLIC_MODE=1 \
    CORE_HOST=0.0.0.0 \
    CORE_DATA_DIR=/data/core \
    ROBOT_DATA_DIR=/data/robot
VOLUME /data
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8787}/api/config" >/dev/null || exit 1

CMD ["bash", "scripts/start-hosted.sh"]
