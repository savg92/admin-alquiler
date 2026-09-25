#!/usr/bin/env bash
set -euo pipefail
mkdir -p apps/{web,api,worker} \
  packages/{domain,auth,permissions,database,documents,notifications,events,config,shared} \
  infrastructure/{docker,compose,deployment} \
  tests/{unit,integration,e2e,security} \
  .github/workflows
echo "Admin alquiler repository tree created."
