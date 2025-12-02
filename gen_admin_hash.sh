#!/usr/bin/env bash
# Generate a bcrypt hash (Node-based) for admin password
if [ -z "$1" ]; then
  echo "Usage: $0 <password>"
  exit 1
fi
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync(process.argv[1], 10));" "$1"
