#!/bin/sh
# Force execution using the snap's bundled Node binary
exec "$SNAP/bin/node" "$SNAP/lib/node_modules/teensyserver/bin/teensyserver.js" "$@"
