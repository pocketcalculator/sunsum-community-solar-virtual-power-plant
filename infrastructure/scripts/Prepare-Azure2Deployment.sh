#!/usr/bin/env bash
set -euo pipefail

parameters_file="${1:?A deployment parameters path is required.}"
missing_secrets=""
if [ -z "${TENANT_ID:-}" ]; then
  missing_secrets="AZURE_TENANT_ID"
fi
if [ -z "${POSTGRES_ADMIN_OBJECT_ID:-}" ]; then
  missing_secrets="${missing_secrets}${missing_secrets:+, }POSTGRES_ADMIN_OBJECT_ID"
fi
if [ -z "${POSTGRES_ADMIN_PRINCIPAL_NAME:-}" ]; then
  missing_secrets="${missing_secrets}${missing_secrets:+, }POSTGRES_ADMIN_PRINCIPAL_NAME"
fi
if [ -n "$missing_secrets" ]; then
  echo "::error::Missing required repository secrets: $missing_secrets. Provision these secrets before dispatching this workflow."
  exit 1
fi

infrastructure/scripts/Compose-Azure2DeploymentParameters.sh "$parameters_file"

unregistered=""
for namespace in Microsoft.OperationalInsights Microsoft.Insights Microsoft.Network; do
  state="$(az provider show --namespace "$namespace" --query registrationState --output tsv)"
  if [ "$state" != "Registered" ]; then
    unregistered="${unregistered}${unregistered:+, }${namespace} ($state)"
  fi
done
if [ -n "$unregistered" ]; then
  echo "::error::Required resource providers are not registered: $unregistered. Register them in the subscription before dispatching this workflow."
  exit 1
fi
