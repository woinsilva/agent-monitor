#!/bin/sh
# Stops the Agent Monitor container. It stays stopped (also after a reboot) until start.sh.
docker stop agent-monitor
