import { defineFunction } from '@aws-amplify/backend';

// AGE service-account token broker. NOT exposed via API Gateway — invoked
// only by the AGE proxy function (see amplify/functions/shared/ageToken.ts).
export const ageToken = defineFunction({
  name: 'age-token',
  entry: './handler.ts',
  timeoutSeconds: 15,
  memoryMB: 256,
  runtime: 20,
  environment: {
    // ARN only — never the secret value. IAM scopes GetSecretValue to this ARN.
    AGE_SECRET_ARN:
      'arn:aws:secretsmanager:us-west-2:433306266182:secret:lifeline-dashboard/age-service-account-xsaNsS',
    AGE_SECRET_REGION: 'us-west-2',
    AGE_TOKEN_ENDPOINT:
      'https://secure.dcgis.org/portal/sharing/rest/oauth2/token',
  },
});
